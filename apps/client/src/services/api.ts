import type { ActionsRecentPayload, ActiveSessionsPayload, LogsPayload } from "../types";

export const fetchLogs = async (): Promise<LogsPayload> => {
  const response = await fetch("/api/logs");
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status}`);
  }
  return response.json() as Promise<LogsPayload>;
};

export const fetchRecentActions = async (limit = 200): Promise<ActionsRecentPayload> => {
  const response = await fetch(`/api/actions/recent?limit=${encodeURIComponent(String(limit))}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch actions: ${response.status}`);
  }
  return response.json() as Promise<ActionsRecentPayload>;
};

export const fetchActiveSessions = async (): Promise<ActiveSessionsPayload> => {
  const response = await fetch("/api/sessions/active");
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.status}`);
  }
  return response.json() as Promise<ActiveSessionsPayload>;
};
