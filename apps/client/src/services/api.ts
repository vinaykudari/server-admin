import type {
  ActionsRecentPayload,
  ActiveJobsPayload,
  ActiveSessionsPayload,
  RecentJobsPayload,
  GatewayLogRecentPayload,
  JobOutputRecentPayload,
  LogsPayload,
} from "../types";

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

export const fetchActiveJobs = async (): Promise<ActiveJobsPayload> => {
  const response = await fetch("/api/jobs/active");
  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status}`);
  }
  return response.json() as Promise<ActiveJobsPayload>;
};

export const fetchGatewayLogRecent = async (tail = 300): Promise<GatewayLogRecentPayload> => {
  const response = await fetch(`/api/jobs/gateway-log/recent?tail=${encodeURIComponent(String(tail))}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch gateway log: ${response.status}`);
  }
  return response.json() as Promise<GatewayLogRecentPayload>;
};

export const fetchRecentJobs = async (limit = 50): Promise<RecentJobsPayload> => {
  const response = await fetch(`/api/jobs/recent?limit=${encodeURIComponent(String(limit))}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch recent jobs: ${response.status}`);
  }
  return response.json() as Promise<RecentJobsPayload>;
};


export const fetchJobOutputRecent = async (messageId: string, tail = 200): Promise<JobOutputRecentPayload> => {
  const response = await fetch(
    `/api/jobs/${encodeURIComponent(messageId)}/output/recent?tail=${encodeURIComponent(String(tail))}`,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ? `Job output unavailable: ${msg}` : `Failed to fetch job output: ${response.status}`);
  }
  return response.json() as Promise<JobOutputRecentPayload>;
};
