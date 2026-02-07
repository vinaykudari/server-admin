import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { readRecentActions, type ActionEvent } from "./actionsService.js";
import type { ActiveProcess } from "./sessionsService.js";
import { listActiveCodexProcesses } from "./sessionsService.js";
import { codexLogsDir } from "../utils/paths.js";

const execFileAsync = promisify(execFile);

export type ActiveJob = {
  messageId: string;
  startedAt?: string;
  pids: number[];
  etime?: string;
  cmd?: string;
};

function parseMessageId(cmd: string): string | null {
  const match = cmd.match(/\[message_id:\s*(\d+)\]/);
  return match?.[1] ?? null;
}

function pickPrimaryProcess(procs: ActiveProcess[]): ActiveProcess {
  // Prefer the process that includes the Telegram message id, which tends to be the user-facing invocation.
  const withMsgId = procs.find((p) => /\[message_id:\s*\d+\]/.test(p.cmd));
  if (withMsgId) return withMsgId;

  // Otherwise, prefer the actual codex exec command (not helper shells).
  const codex = procs.find((p) => /\bcodex\b.*\bexec\b/.test(p.cmd));
  return codex ?? procs[0]!;
}

function findStartedAt(events: ActionEvent[], messageId: string): string | undefined {
  // actions.ndjson stores the full prompt including the message id; use that as join key.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.event !== "start") continue;
    const hay = typeof e.args === "string" ? e.args : JSON.stringify(e.args ?? "");
    if (hay.includes(`[message_id: ${messageId}]`)) return e.ts;
  }
  return undefined;
}

export async function listActiveJobs(): Promise<{ jobs: ActiveJob[]; warning?: string }> {
  const recent = await readRecentActions(1000);
  const result = await listActiveCodexProcesses();
  if (!result.ok) {
    return { jobs: [], warning: result.error };
  }

  const byMessageId = new Map<string, ActiveProcess[]>();
  for (const p of result.processes) {
    const id = parseMessageId(p.cmd);
    if (!id) continue;
    const arr = byMessageId.get(id) ?? [];
    // De-dupe by pid; the same process can appear multiple times if ps output is odd.
    if (!arr.some((x) => x.pid === p.pid)) arr.push(p);
    byMessageId.set(id, arr);
  }

  const jobs: ActiveJob[] = [];
  for (const [messageId, procs] of byMessageId.entries()) {
    const primary = pickPrimaryProcess(procs);
    jobs.push({
      messageId,
      startedAt: findStartedAt(recent, messageId),
      pids: procs.map((x) => x.pid),
      etime: primary.etime,
      cmd: primary.cmd,
    });
  }

  // Stable ordering: newest first when we have startedAt, otherwise by message id desc.
  jobs.sort((a, b) => {
    if (a.startedAt && b.startedAt) return b.startedAt.localeCompare(a.startedAt);
    if (a.startedAt) return -1;
    if (b.startedAt) return 1;
    return Number(b.messageId) - Number(a.messageId);
  });

  return { jobs };
}

export async function resolveGatewayLogPath(): Promise<string> {
  const { stdout } = await execFileAsync(
    "sh",
    ["-lc", "ls -t /tmp/openclaw/openclaw-*.log 2>/dev/null | head -n 1"],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  const p = stdout.trim();
  if (!p) throw new Error("OpenClaw gateway log file not found in /tmp/openclaw");
  return p;
}

export async function readGatewayLogRecent(tailLines: number): Promise<string[]> {
  const logPath = await resolveGatewayLogPath();
  const safe = Number.isFinite(tailLines) ? Math.max(50, Math.min(2000, tailLines)) : 300;
  const { stdout } = await execFileAsync(
    "tail",
    ["-n", String(safe), logPath],
    { timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter(Boolean);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveLatestIfSafe(messageId: string): Promise<string | null> {
  const latest = path.join(codexLogsDir, `msg${messageId}.latest.jsonl`);

  try {
    const st = await fs.lstat(latest);

    // Older Docker-era installs created symlinks pointing to /home/node/... which is wrong on native installs.
    // If the "latest" pointer escapes the Codex logs directory, ignore it and fall back to timestamped files.
    if (st.isSymbolicLink()) {
      const real = await fs.realpath(latest);
      const logsDir = path.resolve(codexLogsDir) + path.sep;
      const resolved = path.resolve(real);
      if (!resolved.startsWith(logsDir)) return null;
    }

    return latest;
  } catch {
    return null;
  }
}

export async function resolveJobOutputPath(messageId: string): Promise<string> {
  const latestOk = await resolveLatestIfSafe(messageId);
  if (latestOk) return latestOk;

  if (!(await pathExists(codexLogsDir))) {
    throw new Error("Codex output directory not found yet; no jobs have written output logs.");
  }

  const entries = await fs.readdir(codexLogsDir);
  const prefix = `msg${messageId}-`;
  const candidates = entries.filter((n) => n.startsWith(prefix) && n.endsWith(".jsonl"));
  if (candidates.length === 0) {
    throw new Error(`No Codex output log found for message_id ${messageId}.`);
  }

  // Names include a UTC timestamp; lexicographic sort yields chronological order.
  candidates.sort().reverse();
  return path.join(codexLogsDir, candidates[0]!);
}

export async function readJobOutputRecent(
  messageId: string,
  tailLines: number,
): Promise<{ path: string; lines: string[] }> {
  const filePath = await resolveJobOutputPath(messageId);
  const safe = Number.isFinite(tailLines) ? Math.max(50, Math.min(2000, tailLines)) : 300;
  const { stdout } = await execFileAsync(
    "tail",
    ["-n", String(safe), filePath],
    { timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
  );

  const lines = stdout
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter(Boolean);

  return { path: filePath, lines };
}

export async function readJobActions(messageId: string, limit: number): Promise<ActionEvent[]> {
  const events = await readRecentActions(limit);
  return events.filter((e) => {
    const hay = typeof e.args === "string" ? e.args : JSON.stringify(e.args ?? "");
    return hay.includes(`[message_id: ${messageId}]`);
  });
}
