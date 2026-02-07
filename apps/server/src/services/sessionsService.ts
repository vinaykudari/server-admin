import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ActiveProcess = {
  pid: number;
  etime: string;
  cmd: string;
};

function parsePsOutput(text: string): ActiveProcess[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ActiveProcess[] = [];
  for (const line of lines) {
    // format: pid etime cmd...
    const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    if (!Number.isFinite(pid)) continue;
    out.push({ pid, etime: match[2] ?? "", cmd: match[3] ?? "" });
  }
  return out;
}

export async function listActiveCodexProcesses(): Promise<ActiveProcess[]> {
  // We treat the OpenClaw gateway container as the "source of truth" for in-flight agent runs.
  // This requires the server-admin service to have permission to call docker.
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      "openclaw-openclaw-gateway-1",
      "sh",
      "-lc",
      // Avoid grep headers and include full cmd.
      "ps -eo pid=,etime=,cmd= | grep -E codex exec | grep -v grep || true",
    ],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );

  return parsePsOutput(stdout);
}
