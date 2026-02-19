import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { codexLogsDir } from "../utils/paths.js";

const execFileAsync = promisify(execFile);

type TurnCompletedUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

type UsageTotals = {
  runs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CodexUsageWindow = UsageTotals & {
  since: string;
  until: string;
};

export type CodexUsageSummary = {
  last5h: CodexUsageWindow;
  last7d: CodexUsageWindow;
  scannedFiles: number;
  newestLogAt?: string;
  warning?: string;
};

export type CodexStatusLimit = {
  usedPercent: number | null;
  windowMinutes: number | null;
  resetsAtEpoch: number | null;
  resetsAt: string | null;
};

export type CodexStatusSummary = {
  object: string;
  source?: string;
  sessionLog?: string;
  capturedAt: string | null;
  ageSeconds: number | null;
  limits: {
    fiveHour: CodexStatusLimit;
    weekly: CodexStatusLimit;
  };
  credits: {
    hasCredits: boolean | null;
    unlimited: boolean | null;
    balance: number | null;
  };
  totals: {
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    reasoningOutputTokens: number | null;
    totalTokens: number | null;
  };
};

export type CodexAccountUsage24h = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CodexAccountStatusSummary = {
  id: string;
  label: string;
  hasAuth: boolean | null;
  usage24h: CodexAccountUsage24h;
  status: CodexStatusSummary | null;
};

export type CodexAccountsSummary = {
  object: string;
  strategy: string;
  selected: {
    id: string;
    label: string;
    reason: string;
    score: number | null;
  } | null;
  capturedAt: string | null;
  accounts: CodexAccountStatusSummary[];
};

export type GcpBillingServiceCost = {
  service: string;
  cost: number;
};

export type GcpBillingDailyCost = {
  day: string;
  cost: number;
};

export type GcpBillingSummary = {
  object: string;
  source: string;
  table: string;
  capturedAt: string;
  ageSeconds: number;
  currency: string;
  totals: {
    today: number;
    last7d: number;
    monthToDate: number;
  };
  topServices: {
    last7d: GcpBillingServiceCost[];
    monthToDate: GcpBillingServiceCost[];
  };
  daily: GcpBillingDailyCost[];
};

const CODEX_STATUS_URL =
  process.env.CODEX_STATUS_URL?.trim() || "https://server.vinaykudari.com/codex/v1/status";
const CODEX_ROUTER_ACCOUNTS_URL =
  process.env.CODEX_ROUTER_ACCOUNTS_URL?.trim() || "https://server.vinaykudari.com/codex/v1/router/accounts";
const CODEX_API_DOTENV_PATH = process.env.CODEX_API_DOTENV_PATH?.trim() || "/srv/apps/codex-openai-api/.env";
const GCP_BILLING_EXPORT_TABLE = process.env.GCP_BILLING_EXPORT_TABLE?.trim() ?? "";
const GCP_BILLING_ACCOUNT_ID = process.env.GCP_BILLING_ACCOUNT_ID?.trim() ?? "";
const GCP_BILLING_PROJECT_ID = process.env.GCP_BILLING_PROJECT_ID?.trim() ?? "";
const GCP_BILLING_LOOKBACK_DAYS = Number(process.env.GCP_BILLING_LOOKBACK_DAYS ?? "45");
const GCP_BILLING_CACHE_MS = Number(process.env.GCP_BILLING_CACHE_MS ?? "300000");

let cachedBearerToken: string | null | undefined;
let cachedGcpSummary: { atMs: number; data: GcpBillingSummary } | null = null;

function emptyTotals(): UsageTotals {
  return { runs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(t: UsageTotals, u: TurnCompletedUsage): void {
  const input = u.input_tokens ?? 0;
  const cached = u.cached_input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  t.runs += 1;
  t.inputTokens += input;
  t.cachedInputTokens += cached;
  t.outputTokens += output;
  t.totalTokens += input + output;
}

function parseTimestampFromName(name: string): number | null {
  // Expected:
  // - msg49-20260207T065846-0800.jsonl
  // - msg20-20260207T050015Z.jsonl
  const m = name.match(/^msg\d+-(\d{8})T(\d{6})(Z|[+-]\d{4})\.jsonl$/);
  if (!m) return null;

  const ymd = m[1]!;
  const hms = m[2]!;
  const tz = m[3]!;

  const yyyy = ymd.slice(0, 4);
  const mm = ymd.slice(4, 6);
  const dd = ymd.slice(6, 8);
  const hh = hms.slice(0, 2);
  const mi = hms.slice(2, 4);
  const ss = hms.slice(4, 6);

  let iso: string;
  if (tz === "Z") {
    iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
  } else {
    // -0800 -> -08:00
    const sign = tz.slice(0, 1);
    const tzh = tz.slice(1, 3);
    const tzm = tz.slice(3, 5);
    iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
  }

  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

async function readTurnUsage(filePath: string): Promise<TurnCompletedUsage | null> {
  // Tail the file to avoid reading huge logs.
  const { stdout } = await execFileAsync("tail", ["-n", "120", filePath], {
    timeout: 5000,
    maxBuffer: 2 * 1024 * 1024,
  });

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Scan from the end for the last `turn.completed` event with a `usage` payload.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (!line.includes('"type":"turn.completed"')) continue;
    if (!line.includes('"usage"')) continue;

    try {
      const obj = JSON.parse(line) as { usage?: TurnCompletedUsage };
      const usage = obj.usage;
      if (!usage) continue;
      return usage;
    } catch {
      // Ignore parse errors; keep scanning earlier lines.
    }
  }

  return null;
}

function maybeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function maybeBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function maybeString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function parseDotenvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

async function resolveCodexBearerToken(): Promise<string | null> {
  if (cachedBearerToken !== undefined) return cachedBearerToken;

  const fromEnv = process.env.COPENAI_API_KEY?.trim();
  if (fromEnv) {
    cachedBearerToken = fromEnv;
    return cachedBearerToken;
  }

  try {
    const content = await fs.readFile(CODEX_API_DOTENV_PATH, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotenvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (key === "COPENAI_API_KEY" && value.trim()) {
        cachedBearerToken = value.trim();
        return cachedBearerToken;
      }
    }
  } catch {
    // ignore
  }

  cachedBearerToken = null;
  return cachedBearerToken;
}

function parseCodexStatusPayload(raw: unknown): CodexStatusSummary {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limits = (obj.limits && typeof obj.limits === "object" ? obj.limits : {}) as Record<string, unknown>;
  const fiveHour = (limits.five_hour && typeof limits.five_hour === "object"
    ? limits.five_hour
    : {}) as Record<string, unknown>;
  const weekly = (limits.weekly && typeof limits.weekly === "object" ? limits.weekly : {}) as Record<string, unknown>;
  const credits = (obj.credits && typeof obj.credits === "object" ? obj.credits : {}) as Record<string, unknown>;
  const totals = (obj.totals && typeof obj.totals === "object" ? obj.totals : {}) as Record<string, unknown>;

  return {
    object: maybeString(obj.object) ?? "codex.status",
    source: maybeString(obj.source) ?? undefined,
    sessionLog: maybeString(obj.session_log) ?? undefined,
    capturedAt: maybeString(obj.captured_at),
    ageSeconds: maybeNumber(obj.age_seconds),
    limits: {
      fiveHour: {
        usedPercent: maybeNumber(fiveHour.used_percent),
        windowMinutes: maybeNumber(fiveHour.window_minutes),
        resetsAtEpoch: maybeNumber(fiveHour.resets_at_epoch),
        resetsAt: maybeString(fiveHour.resets_at),
      },
      weekly: {
        usedPercent: maybeNumber(weekly.used_percent),
        windowMinutes: maybeNumber(weekly.window_minutes),
        resetsAtEpoch: maybeNumber(weekly.resets_at_epoch),
        resetsAt: maybeString(weekly.resets_at),
      },
    },
    credits: {
      hasCredits: maybeBool(credits.has_credits),
      unlimited: maybeBool(credits.unlimited),
      balance: maybeNumber(credits.balance),
    },
    totals: {
      inputTokens: maybeNumber(totals.input_tokens),
      cachedInputTokens: maybeNumber(totals.cached_input_tokens),
      outputTokens: maybeNumber(totals.output_tokens),
      reasoningOutputTokens: maybeNumber(totals.reasoning_output_tokens),
      totalTokens: maybeNumber(totals.total_tokens),
    },
  };
}

function parseCodexAccountsPayload(raw: unknown): CodexAccountsSummary {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const selected = (obj.selected && typeof obj.selected === "object"
    ? obj.selected
    : null) as Record<string, unknown> | null;
  const rawAccounts = Array.isArray(obj.accounts) ? obj.accounts : [];

  const accounts: CodexAccountStatusSummary[] = rawAccounts.map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const usageRaw = (row.usage24h && typeof row.usage24h === "object" ? row.usage24h : {}) as Record<
      string,
      unknown
    >;
    const statusRaw = row.status;
    return {
      id: maybeString(row.id) ?? "unknown",
      label: maybeString(row.label) ?? maybeString(row.id) ?? "Unknown",
      hasAuth: maybeBool(row.hasAuth),
      usage24h: {
        requests: maybeNumber(usageRaw.requests) ?? 0,
        inputTokens: maybeNumber(usageRaw.input_tokens) ?? maybeNumber(usageRaw.inputTokens) ?? 0,
        outputTokens: maybeNumber(usageRaw.output_tokens) ?? maybeNumber(usageRaw.outputTokens) ?? 0,
        totalTokens: maybeNumber(usageRaw.total_tokens) ?? maybeNumber(usageRaw.totalTokens) ?? 0,
      },
      status:
        statusRaw && typeof statusRaw === "object"
          ? parseCodexStatusPayload(statusRaw)
          : null,
    };
  });

  return {
    object: maybeString(obj.object) ?? "codex.router.accounts",
    strategy: maybeString(obj.strategy) ?? "least_pressure",
    selected: selected
      ? {
          id: maybeString(selected.id) ?? "unknown",
          label: maybeString(selected.label) ?? "Unknown",
          reason: maybeString(selected.reason) ?? "unknown",
          score: maybeNumber(selected.score),
        }
      : null,
    capturedAt: maybeString(obj.capturedAt) ?? maybeString(obj.captured_at),
    accounts,
  };
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function assertBillingTable(value: string): string {
  const ok = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(value);
  if (!ok) {
    throw new Error(
      "GCP_BILLING_EXPORT_TABLE must be set as project.dataset.table (BigQuery billing export table).",
    );
  }
  return value;
}

type BillingRow = {
  day?: string;
  service?: string;
  cost?: string | number;
  currency?: string;
};

function dayUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function sumRange(rows: Array<{ day: string; cost: number }>, startDay: string, endDay: string): number {
  let total = 0;
  for (const row of rows) {
    if (row.day >= startDay && row.day <= endDay) total += row.cost;
  }
  return total;
}

function topServicesInRange(
  rows: Array<{ day: string; service: string; cost: number }>,
  startDay: string,
  endDay: string,
  limit = 6,
): GcpBillingServiceCost[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.day < startDay || row.day > endDay) continue;
    map.set(row.service, (map.get(row.service) ?? 0) + row.cost);
  }
  return [...map.entries()]
    .map(([service, cost]) => ({ service, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, Math.max(1, Math.min(20, limit)));
}

export async function getCodexStatusSummary(refresh = false, accountId?: string): Promise<CodexStatusSummary> {
  const bearer = await resolveCodexBearerToken();
  if (!bearer) {
    throw new Error(`Missing COPENAI_API_KEY (env or ${CODEX_API_DOTENV_PATH}).`);
  }

  const url = new URL(CODEX_STATUS_URL);
  if (accountId && accountId.trim()) {
    url.searchParams.set("account", accountId.trim());
  }
  if (refresh) {
    url.searchParams.set("refresh", "true");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail ? `Codex status fetch failed: ${detail}` : `Codex status fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as unknown;
  return parseCodexStatusPayload(body);
}

export async function getCodexAccountsSummary(refresh = false): Promise<CodexAccountsSummary> {
  const bearer = await resolveCodexBearerToken();
  if (!bearer) {
    throw new Error(`Missing COPENAI_API_KEY (env or ${CODEX_API_DOTENV_PATH}).`);
  }

  const url = new URL(CODEX_ROUTER_ACCOUNTS_URL);
  if (refresh) {
    url.searchParams.set("refresh", "true");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(
      detail
        ? `Codex accounts fetch failed: ${detail}`
        : `Codex accounts fetch failed: ${response.status}`,
    );
  }

  const body = (await response.json()) as unknown;
  return parseCodexAccountsPayload(body);
}

export async function getGcpBillingSummary(refresh = false): Promise<GcpBillingSummary> {
  const nowMs = Date.now();
  if (!refresh && cachedGcpSummary && nowMs - cachedGcpSummary.atMs < GCP_BILLING_CACHE_MS) {
    return {
      ...cachedGcpSummary.data,
      ageSeconds: Math.max(0, Math.floor((nowMs - cachedGcpSummary.atMs) / 1000)),
    };
  }

  const table = assertBillingTable(GCP_BILLING_EXPORT_TABLE);
  const lookback = Number.isFinite(GCP_BILLING_LOOKBACK_DAYS)
    ? Math.max(7, Math.min(120, GCP_BILLING_LOOKBACK_DAYS))
    : 45;

  const whereParts = [`usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookback} DAY)`];
  if (GCP_BILLING_ACCOUNT_ID) whereParts.push(`billing_account_id = ${sqlString(GCP_BILLING_ACCOUNT_ID)}`);
  if (GCP_BILLING_PROJECT_ID) whereParts.push(`project.id = ${sqlString(GCP_BILLING_PROJECT_ID)}`);

  const sql = `
SELECT
  CAST(DATE(usage_start_time) AS STRING) AS day,
  IFNULL(service.description, 'Unknown') AS service,
  ROUND(SUM(cost), 6) AS cost,
  ANY_VALUE(currency) AS currency
FROM \`${table}\`
WHERE ${whereParts.join(" AND ")}
GROUP BY day, service
ORDER BY day DESC, cost DESC
`.trim();

  try {
    await execFileAsync("bq", ["show", table], { timeout: 15_000, maxBuffer: 512 * 1024 });
  } catch {
    const pending: GcpBillingSummary = {
      object: "gcp.billing.usage",
      source: "bigquery-export-pending",
      table,
      capturedAt: new Date(nowMs).toISOString(),
      ageSeconds: 0,
      currency: "USD",
      totals: { today: 0, last7d: 0, monthToDate: 0 },
      topServices: { last7d: [], monthToDate: [] },
      daily: [],
    };
    cachedGcpSummary = { atMs: nowMs, data: pending };
    return pending;
  }

  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync("bq", ["query", "--format=json", "--nouse_legacy_sql", sql], {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    if (lowered.includes("not found: table")) {
      const pending: GcpBillingSummary = {
        object: "gcp.billing.usage",
        source: "bigquery-export-pending",
        table,
        capturedAt: new Date(nowMs).toISOString(),
        ageSeconds: 0,
        currency: "USD",
        totals: { today: 0, last7d: 0, monthToDate: 0 },
        topServices: { last7d: [], monthToDate: [] },
        daily: [],
      };
      cachedGcpSummary = { atMs: nowMs, data: pending };
      return pending;
    }
    throw error;
  }

  if (stderr?.trim()) {
    const lowered = stderr.toLowerCase();
    if (lowered.includes("error")) {
      throw new Error(`bq query failed: ${stderr.trim()}`);
    }
  }

  let rawRows: BillingRow[] = [];
  try {
    rawRows = JSON.parse(stdout) as BillingRow[];
  } catch {
    throw new Error("Failed to parse bq query output as JSON.");
  }

  const rows = rawRows
    .map((row) => {
      const day = typeof row.day === "string" ? row.day : "";
      const service = typeof row.service === "string" ? row.service : "Unknown";
      const costNum =
        typeof row.cost === "number" ? row.cost : typeof row.cost === "string" ? Number(row.cost) : NaN;
      const currency = typeof row.currency === "string" && row.currency ? row.currency : "USD";
      return {
        day,
        service,
        cost: Number.isFinite(costNum) ? costNum : 0,
        currency,
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day));

  const currency = rows[0]?.currency ?? "USD";

  const dailyMap = new Map<string, number>();
  for (const row of rows) {
    dailyMap.set(row.day, (dailyMap.get(row.day) ?? 0) + row.cost);
  }
  const daily = [...dailyMap.entries()]
    .map(([day, cost]) => ({ day, cost }))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 45);

  const today = dayUtc(nowMs);
  const sevenDaysAgo = dayUtc(nowMs - 6 * 24 * 60 * 60 * 1000);
  const monthStart = `${today.slice(0, 8)}01`;

  const summary: GcpBillingSummary = {
    object: "gcp.billing.usage",
    source: "bigquery-export",
    table,
    capturedAt: new Date(nowMs).toISOString(),
    ageSeconds: 0,
    currency,
    totals: {
      today: sumRange(daily, today, today),
      last7d: sumRange(daily, sevenDaysAgo, today),
      monthToDate: sumRange(daily, monthStart, today),
    },
    topServices: {
      last7d: topServicesInRange(rows, sevenDaysAgo, today, 6),
      monthToDate: topServicesInRange(rows, monthStart, today, 6),
    },
    daily,
  };

  cachedGcpSummary = { atMs: nowMs, data: summary };
  return summary;
}

export async function getCodexUsageSummary(nowMs = Date.now()): Promise<CodexUsageSummary> {
  const until = new Date(nowMs).toISOString();
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const since5hMs = nowMs - fiveHoursMs;
  const since7dMs = nowMs - sevenDaysMs;

  const last5h = emptyTotals();
  const last7d = emptyTotals();

  let newest: number | null = null;
  let scannedFiles = 0;
  let warning: string | undefined;

  let names: string[] = [];
  try {
    names = await fs.readdir(codexLogsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      last5h: { ...last5h, since: new Date(since5hMs).toISOString(), until },
      last7d: { ...last7d, since: new Date(since7dMs).toISOString(), until },
      scannedFiles: 0,
      warning: `Codex logs directory not readable: ${msg}`,
    };
  }

  const candidates: { filePath: string; tsMs: number }[] = [];

  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    if (name.endsWith(".latest.jsonl")) continue;

    const parsed = parseTimestampFromName(name);
    const filePath = path.join(codexLogsDir, name);

    let tsMs = parsed;
    if (tsMs == null) {
      try {
        const st = await fs.stat(filePath);
        tsMs = st.mtimeMs;
      } catch {
        continue;
      }
    }

    // Skip old files to reduce load.
    if (tsMs < since7dMs) continue;

    candidates.push({ filePath, tsMs });
  }

  candidates.sort((a, b) => b.tsMs - a.tsMs);

  // Cap scanning to avoid pathological IO if log dir explodes.
  const maxFiles = 2000;
  const slice = candidates.slice(0, maxFiles);
  if (candidates.length > maxFiles) {
    warning = `Only scanned newest ${maxFiles} Codex logs (found ${candidates.length}).`;
  }

  for (const c of slice) {
    scannedFiles += 1;
    newest = newest == null ? c.tsMs : Math.max(newest, c.tsMs);

    let usage: TurnCompletedUsage | null = null;
    try {
      usage = await readTurnUsage(c.filePath);
    } catch {
      continue;
    }
    if (!usage) continue;

    if (c.tsMs >= since7dMs) addUsage(last7d, usage);
    if (c.tsMs >= since5hMs) addUsage(last5h, usage);
  }

  return {
    last5h: { ...last5h, since: new Date(since5hMs).toISOString(), until },
    last7d: { ...last7d, since: new Date(since7dMs).toISOString(), until },
    scannedFiles,
    newestLogAt: newest != null ? new Date(newest).toISOString() : undefined,
    warning,
  };
}
