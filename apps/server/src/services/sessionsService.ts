import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ActiveProcess = {
  pid: number;
  etime: string;
  cmd: string;
};

export type ActiveProcessResult =
  | { ok: true; processes: ActiveProcess[] }
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

async function resolveGatewayContainer(): Promise<string> {
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

export async function listActiveCodexProcesses(): Promise<ActiveProcessResult> {
  try {
    const container = await resolveGatewayContainer();

    // Avoid shell quoting issues with a space-containing pattern by escaping the space.
    // We want grep to match the literal substring "codex exec".
    const cmd = "ps -eo pid=,etime=,cmd= | grep -E codex\\ exec | grep -v grep || true";

    const { stdout } = await execFileAsync(
      "docker",
      ["exec", container, "sh", "-lc", cmd],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
    );

    return { ok: true, processes: parsePsOutput(stdout) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, processes: [] };
  }
}
