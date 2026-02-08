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
