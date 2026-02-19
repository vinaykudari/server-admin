import type {
  AgentLogsPayload,
  AgentSessionLogPayload,
  ActionsRecentPayload,
  ActiveJobsPayload,
  ActiveSessionsPayload,
  RecentJobsPayload,
  GatewayLogRecentPayload,
  JobOutputRecentPayload,
  LogsPayload,
  CodexAccountsPayload,
  CodexStatusPayload,
  CodexUsagePayload,
  GcpBillingPayload,
  ManagedCredentialsPayload,
  ManagedEnvPayload,
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

export const fetchAgentLogs = async (agent?: string, limit = 40): Promise<AgentLogsPayload> => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (agent) params.set("agent", agent);
  const response = await fetch(`/api/agents/logs?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to fetch agent logs: ${response.status}`);
  }
  return response.json() as Promise<AgentLogsPayload>;
};

export const fetchAgentSessionLog = async (
  agentId: string,
  sessionId: string,
  tail = 300,
): Promise<AgentSessionLogPayload> => {
  const response = await fetch(
    `/api/agents/logs/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}?tail=${encodeURIComponent(String(tail))}`,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to fetch session log: ${response.status}`);
  }
  return response.json() as Promise<AgentSessionLogPayload>;
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


export const fetchCodexUsage = async (): Promise<CodexUsagePayload> => {
  const response = await fetch("/api/usage/codex");
  if (!response.ok) {
    throw new Error(`Failed to fetch codex usage: ${response.status}`);
  }
  return response.json() as Promise<CodexUsagePayload>;
};

export const fetchCodexStatus = async (refresh = false): Promise<CodexStatusPayload> => {
  const query = refresh ? "?refresh=true" : "";
  const response = await fetch(`/api/usage/codex-status${query}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to fetch codex status: ${response.status}`);
  }
  return response.json() as Promise<CodexStatusPayload>;
};

export const fetchCodexAccounts = async (refresh = false): Promise<CodexAccountsPayload> => {
  const query = refresh ? "?refresh=true" : "";
  const response = await fetch(`/api/usage/codex-accounts${query}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to fetch codex account statuses: ${response.status}`);
  }
  return response.json() as Promise<CodexAccountsPayload>;
};

export const fetchGcpBilling = async (refresh = false): Promise<GcpBillingPayload> => {
  const query = refresh ? "?refresh=true" : "";
  const response = await fetch(`/api/usage/gcp-billing${query}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to fetch GCP billing usage: ${response.status}`);
  }
  return response.json() as Promise<GcpBillingPayload>;
};

export const fetchManagedEnv = async (): Promise<ManagedEnvPayload> => {
  const response = await fetch("/api/config/env");
  if (!response.ok) {
    throw new Error(`Failed to fetch managed env vars: ${response.status}`);
  }
  return response.json() as Promise<ManagedEnvPayload>;
};

export const upsertManagedEnv = async (key: string, value: string): Promise<void> => {
  const response = await fetch(`/api/config/env/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to update env var: ${response.status}`);
  }
};

export const deleteManagedEnv = async (key: string): Promise<void> => {
  const response = await fetch(`/api/config/env/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to delete env var: ${response.status}`);
  }
};

export const fetchManagedCredentials = async (): Promise<ManagedCredentialsPayload> => {
  const response = await fetch("/api/config/credentials");
  if (!response.ok) {
    throw new Error(`Failed to fetch credentials: ${response.status}`);
  }
  return response.json() as Promise<ManagedCredentialsPayload>;
};

export const createCredential = async (domain: string, username: string, password: string): Promise<void> => {
  const response = await fetch("/api/config/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, username, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to create credential: ${response.status}`);
  }
};

export const updateCredential = async (
  id: string,
  domain: string,
  username: string,
  password: string,
): Promise<void> => {
  const response = await fetch(`/api/config/credentials/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, username, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to update credential: ${response.status}`);
  }
};

export const deleteCredential = async (id: string): Promise<void> => {
  const response = await fetch(`/api/config/credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as unknown));
    const msg = (body as { error?: string }).error;
    throw new Error(msg ?? `Failed to delete credential: ${response.status}`);
  }
};
