import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { credentialStorePath, managedEnvPath } from "../utils/paths.js";

const execFileAsync = promisify(execFile);

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const OPENCLAW_USER = process.env.OPENCLAW_USER ?? "openclaw";

export class ValidationError extends Error {}

export type EnvVarEntry = {
  key: string;
  value: string;
};

export type CredentialEntry = {
  id: string;
  domain: string;
  username: string;
  password: string;
  updatedAt: string;
};

type CredentialStoreV1 = {
  version?: 1;
  updatedAt?: string;
  credentials?: Record<string, { value?: unknown; updatedAt?: unknown }>;
};

type CredentialStore = {
  version: 2;
  updatedAt: string;
  credentials: CredentialEntry[];
};

let cachedOpenclawIds: { uid: number; gid: number } | null = null;
let attemptedOpenclawLookup = false;

function assertValidKey(rawKey: string): string {
  const key = String(rawKey ?? "").trim();
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new ValidationError("Invalid key. Use A-Z, 0-9, and underscore only, starting with a letter/underscore.");
  }
  return key;
}

function assertCredentialId(raw: string): string {
  const id = String(raw ?? "").trim();
  if (!id) {
    throw new ValidationError("Credential id is required.");
  }
  return id;
}

function normalizeDomain(raw: string): string {
  let value = String(raw ?? "").trim().toLowerCase();
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      value = parsed.host.toLowerCase();
    } catch {
      // Keep the raw value and validate below.
    }
  }

  if (!value) {
    throw new ValidationError("Domain is required.");
  }
  if (/\s/.test(value)) {
    throw new ValidationError("Domain cannot contain spaces.");
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new ValidationError("Domain contains unsupported characters.");
  }
  return value;
}

function normalizeUsername(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new ValidationError("Username is required.");
  }
  if (value.length > 256) {
    throw new ValidationError("Username is too long.");
  }
  return value;
}

function normalizePassword(raw: string): string {
  const value = String(raw ?? "");
  if (!value) {
    throw new ValidationError("Password is required.");
  }
  if (value.length > 8192) {
    throw new ValidationError("Password is too long.");
  }
  return value;
}

function normalizeUpdatedAt(raw: unknown): string {
  if (typeof raw !== "string") return new Date().toISOString();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function sanitizeCredentialEntries(rawEntries: unknown[]): CredentialEntry[] {
  const byPair = new Map<string, CredentialEntry>();

  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Partial<CredentialEntry>;

    try {
      const domain = normalizeDomain(String(entry.domain ?? ""));
      const username = normalizeUsername(String(entry.username ?? ""));
      const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : randomUUID();
      const password = typeof entry.password === "string" ? entry.password : "";
      const updatedAt = normalizeUpdatedAt(entry.updatedAt);
      const pairKey = `${domain}\u0000${username}`;
      const next = { id, domain, username, password, updatedAt };

      const current = byPair.get(pairKey);
      if (!current) {
        byPair.set(pairKey, next);
        continue;
      }

      const currentTs = Date.parse(current.updatedAt);
      const nextTs = Date.parse(next.updatedAt);
      const useNext = Number.isFinite(nextTs) && (!Number.isFinite(currentTs) || nextTs >= currentTs);
      if (useNext) byPair.set(pairKey, next);
    } catch {
      // Skip malformed entries.
    }
  }

  return Array.from(byPair.values());
}

async function resolveOpenclawIds(): Promise<{ uid: number; gid: number } | null> {
  if (attemptedOpenclawLookup) return cachedOpenclawIds;
  attemptedOpenclawLookup = true;

  try {
    const [uidOut, gidOut] = await Promise.all([
      execFileAsync("id", ["-u", OPENCLAW_USER]),
      execFileAsync("id", ["-g", OPENCLAW_USER]),
    ]);
    const uid = Number(uidOut.stdout.trim());
    const gid = Number(gidOut.stdout.trim());
    if (!Number.isFinite(uid) || !Number.isFinite(gid)) return null;
    cachedOpenclawIds = { uid, gid };
    return cachedOpenclawIds;
  } catch {
    return null;
  }
}

async function securePathForOpenclaw(targetPath: string, mode: number): Promise<void> {
  try {
    const ids = await resolveOpenclawIds();
    if (ids && process.geteuid?.() === 0) {
      await fs.chown(targetPath, ids.uid, ids.gid);
    }
  } catch {
    // Best effort only; do not fail data operations on ownership issues.
  }

  try {
    await fs.chmod(targetPath, mode);
  } catch {
    // Best effort only; do not fail data operations on chmod issues.
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await securePathForOpenclaw(dir, 0o750);
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, data, "utf8");
  await securePathForOpenclaw(tmpPath, 0o640);
  await fs.rename(tmpPath, filePath);
  await securePathForOpenclaw(filePath, 0o640);
}

function decodeEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function encodeEnvValue(value: string): string {
  if (value === "") return "\"\"";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")}"`;
}

async function ensureEnvFile(): Promise<void> {
  try {
    await fs.access(managedEnvPath);
  } catch {
    await atomicWrite(managedEnvPath, "");
  }
}

async function readEnvMap(): Promise<Map<string, string>> {
  await ensureEnvFile();
  const content = await fs.readFile(managedEnvPath, "utf8");
  const map = new Map<string, string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);

    if (!ENV_KEY_PATTERN.test(key)) continue;
    map.set(key, decodeEnvValue(value));
  }

  return map;
}

async function writeEnvMap(map: Map<string, string>): Promise<void> {
  const lines = Array.from(map.entries()).map(([key, value]) => `${key}=${encodeEnvValue(value)}`);
  await atomicWrite(managedEnvPath, lines.join("\n") + (lines.length > 0 ? "\n" : ""));
}

function sortEnvEntries(entries: EnvVarEntry[]): EnvVarEntry[] {
  return [...entries].sort((a, b) => a.key.localeCompare(b.key));
}

function emptyCredentialStore(): CredentialStore {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    credentials: [],
  };
}

async function ensureCredentialStoreFile(): Promise<void> {
  try {
    await fs.access(credentialStorePath);
  } catch {
    await atomicWrite(credentialStorePath, JSON.stringify(emptyCredentialStore(), null, 2) + "\n");
  }
}

async function readCredentialStore(): Promise<CredentialStore> {
  await ensureCredentialStoreFile();
  const raw = await fs.readFile(credentialStorePath, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === "object") {
      const object = parsed as Partial<CredentialStore> & CredentialStoreV1;

      if (object.version === 2 && Array.isArray(object.credentials)) {
        const store: CredentialStore = {
          version: 2,
          updatedAt: normalizeUpdatedAt(object.updatedAt),
          credentials: sanitizeCredentialEntries(object.credentials),
        };
        return store;
      }

      if (object.credentials && typeof object.credentials === "object" && !Array.isArray(object.credentials)) {
        const migratedEntries: CredentialEntry[] = [];
        for (const [legacyKey, legacyValue] of Object.entries(object.credentials)) {
          const domain = legacyKey.trim().toLowerCase();
          if (!domain) continue;
          const password =
            legacyValue && typeof legacyValue === "object" && "value" in legacyValue
              ? String((legacyValue as { value?: unknown }).value ?? "")
              : "";
          const updatedAt =
            legacyValue && typeof legacyValue === "object" && "updatedAt" in legacyValue
              ? normalizeUpdatedAt((legacyValue as { updatedAt?: unknown }).updatedAt)
              : new Date().toISOString();

          migratedEntries.push({
            id: randomUUID(),
            domain,
            username: "legacy",
            password,
            updatedAt,
          });
        }

        const migrated: CredentialStore = {
          version: 2,
          updatedAt: new Date().toISOString(),
          credentials: sanitizeCredentialEntries(migratedEntries),
        };
        await writeCredentialStore(migrated);
        return migrated;
      }
    }
  } catch {
    // Fall through and recreate a valid file.
  }

  const fallback = emptyCredentialStore();
  await atomicWrite(credentialStorePath, JSON.stringify(fallback, null, 2) + "\n");
  return fallback;
}

async function writeCredentialStore(store: CredentialStore): Promise<void> {
  await atomicWrite(credentialStorePath, JSON.stringify(store, null, 2) + "\n");
}

function sortCredentialEntries(entries: CredentialEntry[]): CredentialEntry[] {
  return [...entries].sort((a, b) => {
    const domainCmp = a.domain.localeCompare(b.domain);
    if (domainCmp !== 0) return domainCmp;
    return a.username.localeCompare(b.username);
  });
}

export async function initializeManagedConfigFiles(): Promise<void> {
  await ensureEnvFile();
  await ensureCredentialStoreFile();
}

export async function listManagedEnv(): Promise<{ path: string; entries: EnvVarEntry[] }> {
  const envMap = await readEnvMap();
  const entries = sortEnvEntries(Array.from(envMap.entries()).map(([key, value]) => ({ key, value })));
  return { path: managedEnvPath, entries };
}

export async function upsertManagedEnv(keyRaw: string, valueRaw: string): Promise<EnvVarEntry> {
  const key = assertValidKey(keyRaw);
  const value = String(valueRaw ?? "");
  const envMap = await readEnvMap();
  envMap.set(key, value);
  await writeEnvMap(envMap);
  return { key, value };
}

export async function removeManagedEnv(keyRaw: string): Promise<void> {
  const key = assertValidKey(keyRaw);
  const envMap = await readEnvMap();
  envMap.delete(key);
  await writeEnvMap(envMap);
}

export async function listCredentials(): Promise<{ path: string; entries: CredentialEntry[] }> {
  const store = await readCredentialStore();
  const entries = sortCredentialEntries(store.credentials);
  return { path: credentialStorePath, entries };
}

export async function createCredential(
  domainRaw: string,
  usernameRaw: string,
  passwordRaw: string,
): Promise<CredentialEntry> {
  const domain = normalizeDomain(domainRaw);
  const username = normalizeUsername(usernameRaw);
  const password = normalizePassword(passwordRaw);
  const store = await readCredentialStore();
  const now = new Date().toISOString();

  const index = store.credentials.findIndex((entry) => entry.domain === domain && entry.username === username);
  if (index >= 0) {
    const updated: CredentialEntry = {
      ...store.credentials[index]!,
      password,
      updatedAt: now,
    };
    store.credentials[index] = updated;
    store.updatedAt = now;
    await writeCredentialStore(store);
    return updated;
  }

  const created: CredentialEntry = {
    id: randomUUID(),
    domain,
    username,
    password,
    updatedAt: now,
  };
  store.credentials.push(created);
  store.updatedAt = now;
  await writeCredentialStore(store);
  return created;
}

export async function updateCredential(
  idRaw: string,
  domainRaw: string,
  usernameRaw: string,
  passwordRaw: string,
): Promise<CredentialEntry> {
  const id = assertCredentialId(idRaw);
  const domain = normalizeDomain(domainRaw);
  const username = normalizeUsername(usernameRaw);
  const password = normalizePassword(passwordRaw);
  const store = await readCredentialStore();
  const now = new Date().toISOString();

  const index = store.credentials.findIndex((entry) => entry.id === id);
  if (index < 0) {
    throw new ValidationError("Credential not found.");
  }

  const duplicate = store.credentials.find((entry) => entry.id !== id && entry.domain === domain && entry.username === username);
  if (duplicate) {
    throw new ValidationError("A credential for this domain + username already exists.");
  }

  const updated: CredentialEntry = {
    ...store.credentials[index]!,
    domain,
    username,
    password,
    updatedAt: now,
  };
  store.credentials[index] = updated;
  store.updatedAt = now;
  await writeCredentialStore(store);
  return updated;
}

export async function removeCredential(idRaw: string): Promise<void> {
  const id = assertCredentialId(idRaw);
  const store = await readCredentialStore();
  const nextEntries = store.credentials.filter((entry) => entry.id !== id);
  if (nextEntries.length === store.credentials.length) return;
  store.credentials = nextEntries;
  store.updatedAt = new Date().toISOString();
  await writeCredentialStore(store);
}
