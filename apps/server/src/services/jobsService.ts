import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { readRecentActions, type ActionEvent } from "./actionsService.js";
import type { ActiveProcess } from "./sessionsService.js";
import { listActiveCodexProcesses } from "./sessionsService.js";

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
  // Prefer the wrapper command; it contains the user-facing prompt snippet.
  const wrapper = procs.find((p) => p.cmd.includes("/usr/local/bin/codex exec"));
  return wrapper ?? procs[0]!;
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

async function resolveGatewayContainerId(): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    ["ps", "--format", "{{.ID}} {{.Names}}"],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [id, name] = line.split(/\s+/, 2);
    if (name === "openclaw-openclaw-gateway-1" && id) return id;
  }

  for (const line of lines) {
    const [id, name] = line.split(/\s+/, 2);
    if (!id || !name) continue;
    if (name.includes("openclaw") && name.includes("gateway")) return id;
  }

  throw new Error("OpenClaw gateway container not found");
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
    arr.push(p);
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
  const container = await resolveGatewayContainerId();
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", container, "sh", "-lc", "ls -t /tmp/openclaw/openclaw-*.log 2>/dev/null | head -n 1"],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  const path = stdout.trim();
  if (!path) throw new Error("OpenClaw gateway log file not found in /tmp/openclaw");
  return path;
}

export async function readGatewayLogRecent(tailLines: number): Promise<string[]> {
  const container = await resolveGatewayContainerId();
  const logPath = await resolveGatewayLogPath();
  const safe = Number.isFinite(tailLines) ? Math.max(50, Math.min(2000, tailLines)) : 300;
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", container, "sh", "-lc", `tail -n ${safe} ${logPath}`],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  return stdout
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter(Boolean);
}

export async function readJobActions(messageId: string, limit: number): Promise<ActionEvent[]> {
  const events = await readRecentActions(limit);
  return events.filter((e) => {
    const hay = typeof e.args === "string" ? e.args : JSON.stringify(e.args ?? "");
    return hay.includes(`[message_id: ${messageId}]`);
  });
}
