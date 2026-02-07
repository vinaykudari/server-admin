import type { LogsPayload } from "../types";

export const fetchLogs = async (): Promise<LogsPayload> => {
  const response = await fetch("/api/logs");
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status}`);
  }
  return response.json() as Promise<LogsPayload>;
};
