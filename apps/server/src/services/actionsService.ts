import fs from "node:fs/promises";

import { actionsLogPath } from "../utils/paths.js";

export type ActionEvent = {
  ts?: string;
  source?: string;
  actor?: string;
  event?: string;
  cwd?: string;
  args?: unknown;
  exit_code?: number;
  duration_sec?: number;
  [key: string]: unknown;
};

export async function readRecentActions(limit: number): Promise<ActionEvent[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, limit)) : 200;
  const raw = await fs.readFile(actionsLogPath, "utf8");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const tail = lines.slice(-safeLimit);
  const events: ActionEvent[] = [];
  for (const line of tail) {
    try {
      events.push(JSON.parse(line) as ActionEvent);
    } catch {
      events.push({ event: "parse_error", raw: line });
    }
  }
  return events;
}
