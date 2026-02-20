import { promises as fs } from "node:fs";
import path from "node:path";

import { agentsRoot } from "../utils/paths.js";

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

export type AgentSessionSummary = {
  sessionId: string;
  updatedAt: string;
  sizeBytes: number;
  hasLogFile?: boolean;
};

export type AgentLogsSummary = {
  agents: string[];
  agent: string | null;
  sessions: AgentSessionSummary[];
};

export type AgentSessionLog = {
  agent: string;
  sessionId: string;
  path: string;
  lines: string[];
};

const isSafeId = (value: string) => SAFE_ID.test(value);

const sessionsDirFor = (agentId: string) => path.join(agentsRoot, agentId, "sessions");
const sessionsIndexPathFor = (agentId: string) => path.join(sessionsDirFor(agentId), "sessions.json");
const crop = (value: string, max = 240) => (value.length > max ? `${value.slice(0, max)}...` : value);
const fmtTime = (value: unknown) => {
  if (typeof value !== "string") return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString();
};

const ensureSafeAgent = (agentId: string) => {
  if (!isSafeId(agentId)) {
    throw new Error("Invalid agent id.");
  }
};

const ensureSafeSession = (sessionId: string) => {
  if (!isSafeId(sessionId)) {
    throw new Error("Invalid session id.");
  }
};

export async function listAgentIds(): Promise<string[]> {
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true }).catch(() => []);
  const agents = entries.filter((ent) => ent.isDirectory() && isSafeId(ent.name)).map((ent) => ent.name);
  return agents.sort();
}

export async function listAgentLogSessions(agentId: string, limit = 40): Promise<AgentSessionSummary[]> {
  ensureSafeAgent(agentId);
  const sessionsDir = sessionsDirFor(agentId);
  const indexPath = sessionsIndexPathFor(agentId);
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((ent) => ent.isFile() && ent.name.endsWith(".jsonl") && !ent.name.includes(".bak"))
    .map((ent) => ent.name);

  const fileStats = await Promise.all(
    files.map(async (name) => {
      const full = path.join(sessionsDir, name);
      const st = await fs.stat(full);
      return {
        sessionId: name.replace(/\.jsonl$/, ""),
        mtimeMs: st.mtimeMs,
        sizeBytes: st.size,
        hasLogFile: true,
      };
    }),
  );

  const metadataStats = await fs
    .readFile(indexPath, "utf8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const bySession = new Map<string, { sessionId: string; mtimeMs: number; sizeBytes: number; hasLogFile: boolean }>();
      for (const value of Object.values(parsed)) {
        const sessionId = typeof value?.sessionId === "string" ? value.sessionId : "";
        if (!sessionId || !isSafeId(sessionId)) continue;
        const updatedAt = Number(value?.updatedAt ?? 0);
        const mtimeMs = Number.isFinite(updatedAt) ? updatedAt : 0;
        const prior = bySession.get(sessionId);
        if (!prior || mtimeMs > prior.mtimeMs) {
          bySession.set(sessionId, {
            sessionId,
            mtimeMs,
            sizeBytes: 0,
            hasLogFile: false,
          });
        }
      }
      return [...bySession.values()];
    })
    .catch(() => []);

  const merged = new Map<string, { sessionId: string; mtimeMs: number; sizeBytes: number; hasLogFile: boolean }>();
  for (const row of metadataStats) merged.set(row.sessionId, row);
  for (const row of fileStats) {
    const prior = merged.get(row.sessionId);
    if (!prior || row.mtimeMs >= prior.mtimeMs) {
      merged.set(row.sessionId, row);
    } else if (prior) {
      prior.hasLogFile = true;
      prior.sizeBytes = row.sizeBytes;
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, Math.min(200, limit)))
    .map((item) => ({
      sessionId: item.sessionId,
      updatedAt: new Date(item.mtimeMs).toISOString(),
      sizeBytes: item.sizeBytes,
      hasLogFile: item.hasLogFile,
    }));
}

const toReadableLine = (line: string): string | null => {
  try {
    const payload = JSON.parse(line) as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : "";
    const ts = fmtTime(payload.timestamp);
    const timePrefix = ts ? `${ts} ` : "";

    if (type === "session") {
      return `${timePrefix}session started`;
    }
    if (type === "model_change") {
      const provider = typeof payload.provider === "string" ? payload.provider : "unknown";
      const modelId = typeof payload.modelId === "string" ? payload.modelId : "unknown";
      return `${timePrefix}model ${provider}/${modelId}`;
    }
    if (type === "thinking_level_change") {
      const level = typeof payload.thinkingLevel === "string" ? payload.thinkingLevel : "unknown";
      return `${timePrefix}thinking ${level}`;
    }

    if (type === "message") {
      const message = payload.message as Record<string, unknown> | undefined;
      const role = typeof message?.role === "string" ? message.role : null;
      const content = Array.isArray(message?.content) ? (message.content as Array<Record<string, unknown>>) : [];
      if (!role) return null;

      if (role === "toolResult") {
        const tool = typeof message.toolName === "string" ? message.toolName : "tool";
        const firstText = content.find((part) => typeof part?.text === "string")?.text as string | undefined;
        if (firstText) {
          try {
            const parsed = JSON.parse(firstText) as Record<string, unknown>;
            if (typeof parsed.ok === "boolean") {
              return `${timePrefix}tool ${tool} result: ${parsed.ok ? "ok" : "error"}`;
            }
          } catch {
            // Ignore JSON parse errors and fallback below.
          }
          return `${timePrefix}tool ${tool} result: ${crop(firstText.replace(/\s+/g, " ").trim(), 140)}`;
        }
        return `${timePrefix}tool ${tool} result`;
      }

      const parts = content
        .map((part) => {
          const kind = typeof part?.type === "string" ? part.type : "";
          if (kind === "text" && typeof part.text === "string") {
            return part.text.replace(/\s+/g, " ").trim();
          }
          if (kind === "toolCall") {
            const name = typeof part.name === "string" ? part.name : "tool";
            const args = (part.arguments as Record<string, unknown> | undefined) ?? {};
            const command = typeof args.command === "string" ? args.command : "";
            return command ? `tool ${name}: ${command}` : `tool ${name}`;
          }
          return "";
        })
        .filter(Boolean);

      if (parts.length === 0) return null;
      return `${timePrefix}${role}: ${crop(parts.join(" | "), 240)}`;
    }
  } catch {
    // Ignore invalid JSON lines.
  }
  return null;
};

export async function readAgentSessionLog(agentId: string, sessionId: string, tail = 300): Promise<AgentSessionLog> {
  ensureSafeAgent(agentId);
  ensureSafeSession(sessionId);

  const filePath = path.join(sessionsDirFor(agentId), `${sessionId}.jsonl`);
  let selected: string[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const safeTail = Math.max(1, Math.min(5000, tail));
    selected = lines.slice(-safeTail).map(toReadableLine).filter((line): line is string => Boolean(line));
  } catch (error) {
    const indexPath = sessionsIndexPathFor(agentId);
    const rawIndex = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(rawIndex) as Record<string, Record<string, unknown>>;
    const matched = Object.entries(parsed).filter(([, value]) => value?.sessionId === sessionId);
    if (matched.length === 0) throw error;

    const lines: string[] = ["session metadata only (no .jsonl log file found)"];
    for (const [key, value] of matched.slice(0, 8)) {
      const updatedMs = Number(value.updatedAt ?? 0);
      const when = Number.isFinite(updatedMs) ? new Date(updatedMs).toLocaleString() : "unknown";
      const model = typeof value.model === "string" ? value.model : "unknown";
      const provider = typeof value.modelProvider === "string" ? value.modelProvider : "unknown";
      const tokens = typeof value.totalTokens === "number" ? String(value.totalTokens) : "-";
      lines.push(`${key} | ${when} | ${provider}/${model} | totalTokens ${tokens}`);
    }
    selected = lines;
  }

  return {
    agent: agentId,
    sessionId,
    path: filePath,
    lines: selected,
  };
}
