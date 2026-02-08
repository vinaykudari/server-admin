export type LogDocument = {
  name: "RUNBOOK" | "TASKS";
  path: string;
  content: string;
  updatedAt: string;
};

export type LogsPayload = {
  runbook: LogDocument;
  tasks: LogDocument;
};

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

export type ActiveProcess = {
  pid: number;
  etime: string;
  cmd: string;
};

export type ActiveJob = {
  messageId: string;
  startedAt?: string;
  pids: number[];
  etime?: string;
  cmd?: string;
};

export type RecentJob = {
  messageId: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  durationSec?: number;
  actor?: string;
  source?: string;
  runLog?: string;
  status: "running" | "ok" | "error" | "unknown";
};

export type ActionsRecentPayload = {
  events: ActionEvent[];
};

export type ActiveSessionsPayload = {
  processes: ActiveProcess[];
  error?: string;
};

export type ActiveJobsPayload = {
  jobs: ActiveJob[];
  warning?: string;
};

export type RecentJobsPayload = {
  jobs: RecentJob[];
};

export type GatewayLogRecentPayload = {
  lines: string[];
  warning?: string;
};

export type JobOutputRecentPayload = {
  path: string;
  lines: string[];
};


export type CodexUsageWindow = {
  runs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  since: string;
  until: string;
};

export type CodexUsagePayload = {
  last5h: CodexUsageWindow;
  last7d: CodexUsageWindow;
  scannedFiles: number;
  newestLogAt?: string;
  warning?: string;
};


export type CodexStatusPayload = {
  model?: string;
  account?: string;
  fiveHour?: { leftPercent: number; resets: string };
  weekly?: { leftPercent: number; resets: string };
  error?: string;
};
