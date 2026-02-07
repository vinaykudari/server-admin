import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ActiveProcess = {
  pid: number;
  etime: string;
  cmd: string;
  container?: string;
};

export type ActiveProcessResult =
  | { ok: true; processes: ActiveProcess[]; warning?: string }
  | { ok: false; error: string; processes: ActiveProcess[] };

function parsePsOutput(text: string): ActiveProcess[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ActiveProcess[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    if (!Number.isFinite(pid)) continue;
    out.push({ pid, etime: match[2] ?? "", cmd: match[3] ?? "" });
  }
  return out;
}

function isCodexJob(cmd: string): boolean {
  // OpenClaw runs Codex via the codex CLI backend (codex-audit -> codex exec ...).
  // We identify active jobs by the `codex exec` argv pattern.
  return /\bcodex\b/.test(cmd) && /\bexec\b/.test(cmd);
}

export async function listActiveCodexProcesses(): Promise<ActiveProcessResult> {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid=,etime=,cmd="],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
    );

    const processes = parsePsOutput(stdout).filter((p) => isCodexJob(p.cmd));
    return { ok: true, processes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, processes: [] };
  }
}
