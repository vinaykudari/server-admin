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

function parsePsOutput(text: string, container?: string): ActiveProcess[] {
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
    out.push({ pid, etime: match[2] ?? "", cmd: match[3] ?? "", container });
  }
  return out;
}

async function listOpenclawContainers(): Promise<{ id: string; name: string }[]> {
  const { stdout } = await execFileAsync(
    "docker",
    ["ps", "--format", "{{.ID}} {{.Names}}"],
    { timeout: 5000, maxBuffer: 1024 * 1024 },
  );

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: { id: string; name: string }[] = [];
  for (const line of lines) {
    const [id, name] = line.split(/\s+/, 2);
    if (!id || !name) continue;
    rows.push({ id, name });
  }
  return rows;
}

async function resolveOpenclawContainerIds(): Promise<string[]> {
  const rows = await listOpenclawContainers();

  const ordered: string[] = [];
  const seen = new Set<string>();

  const prefer = ["openclaw-openclaw-gateway-1", "openclaw-openclaw-cli-1"];
  for (const exact of prefer) {
    const hit = rows.find((r) => r.name === exact);
    if (hit && !seen.has(hit.id)) {
      ordered.push(hit.id);
      seen.add(hit.id);
    }
  }

  for (const r of rows) {
    if (seen.has(r.id)) continue;
    if (!r.name.includes("openclaw")) continue;
    if (r.name.includes("gateway") || r.name.includes("cli")) {
      ordered.push(r.id);
      seen.add(r.id);
    }
  }

  if (ordered.length === 0) throw new Error("OpenClaw containers not found");
  return ordered;
}

export async function listActiveCodexProcesses(): Promise<ActiveProcessResult> {
  // Codex can run in either the gateway or CLI container depending on OpenClaw version/config.
  // Probe both and merge.
  const cmd = "ps -eo pid=,etime=,cmd= | grep -E codex\\ exec | grep -v grep || true";

  try {
    const containers = await resolveOpenclawContainerIds();

    const processes: ActiveProcess[] = [];
    const errors: string[] = [];

    for (const container of containers) {
      try {
        const { stdout } = await execFileAsync(
          "docker",
          ["exec", container, "sh", "-lc", cmd],
          { timeout: 5000, maxBuffer: 1024 * 1024 },
        );
        processes.push(...parsePsOutput(stdout, container));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
      }
    }

    if (processes.length > 0) {
      return {
        ok: true,
        processes,
        warning: errors.length > 0 ? errors.join("; ") : undefined,
      };
    }

    if (errors.length > 0) {
      return { ok: false, error: errors.join("; "), processes: [] };
    }

    return { ok: true, processes: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, processes: [] };
  }
}
