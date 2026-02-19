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

export type CodexStatusLimit = {
  usedPercent: number | null;
  windowMinutes: number | null;
  resetsAtEpoch: number | null;
  resetsAt: string | null;
};

export type CodexStatusPayload = {
  object: string;
  source?: string;
  sessionLog?: string;
  account?: {
    id: string;
    label?: string;
  };
  capturedAt: string | null;
  ageSeconds: number | null;
  limits: {
    fiveHour: CodexStatusLimit;
    weekly: CodexStatusLimit;
  };
  credits: {
    hasCredits: boolean | null;
    unlimited: boolean | null;
    balance: number | null;
  };
  totals: {
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    reasoningOutputTokens: number | null;
    totalTokens: number | null;
  };
};

export type CodexAccountUsage24h = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CodexAccountStatusPayload = {
  id: string;
  label: string;
  hasAuth: boolean | null;
  usage24h: CodexAccountUsage24h;
  status: CodexStatusPayload | null;
};

export type CodexAccountsPayload = {
  object: string;
  strategy: string;
  selected: {
    id: string;
    label: string;
    reason: string;
    score: number | null;
  } | null;
  capturedAt: string | null;
  accounts: CodexAccountStatusPayload[];
};

export type GcpBillingServiceCost = {
  service: string;
  cost: number;
};

export type GcpBillingDailyCost = {
  day: string;
  cost: number;
};

export type GcpBillingPayload = {
  object: string;
  source: string;
  table: string;
  capturedAt: string;
  ageSeconds: number;
  currency: string;
  totals: {
    today: number;
    last7d: number;
    monthToDate: number;
  };
  topServices: {
    last7d: GcpBillingServiceCost[];
    monthToDate: GcpBillingServiceCost[];
  };
  daily: GcpBillingDailyCost[];
};

export type EnvVarEntry = {
  key: string;
  value: string;
};

export type ManagedEnvPayload = {
  path: string;
  entries: EnvVarEntry[];
};

export type CredentialEntry = {
  id: string;
  domain: string;
  username: string;
  password: string;
  updatedAt: string;
};

export type ManagedCredentialsPayload = {
  path: string;
  entries: CredentialEntry[];
};

export type AgentSessionSummary = {
  sessionId: string;
  updatedAt: string;
  sizeBytes: number;
  hasLogFile?: boolean;
};

export type AgentLogsPayload = {
  agents: string[];
  agent: string | null;
  sessions: AgentSessionSummary[];
};

export type AgentSessionLogPayload = {
  agent: string;
  sessionId: string;
  path: string;
  lines: string[];
};
