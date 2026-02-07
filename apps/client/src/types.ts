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

export type GatewayLogRecentPayload = {
  lines: string[];
};
