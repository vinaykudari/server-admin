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

export type CodexSourceCategory = "api" | "openclaw" | "cli-codex" | "other";

export type CodexSourceUsageTotals = {
  requests: number;
  successes: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CodexSourceUsageCategory = CodexSourceUsageTotals & {
  category: CodexSourceCategory;
  label: string;
  accountCount: number;
  sourceCount: number;
  successRate: number;
  percentOfTotal: number;
};

export type CodexSourceUsageRow = CodexSourceUsageTotals & {
  accountId: string;
  source: string;
  category: CodexSourceCategory;
  successRate: number;
};

export type CodexSourceUsagePayload = {
  object: "codex.source.usage";
  source: "codex-multi-router-db";
  dbPath: string;
  lookbackHours: number;
  since: string;
  capturedAt: string;
  totals: CodexSourceUsageTotals;
  categories: CodexSourceUsageCategory[];
  rows: CodexSourceUsageRow[];
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
  grossCost: number;
  credits: number;
  netCost: number;
};

export type GcpBillingDailyCost = {
  day: string;
  grossCost: number;
  credits: number;
  netCost: number;
};

export type GcpBillingTotals = {
  today: number;
  last7d: number;
  monthToDate: number;
};

export type GcpBudgetPubsubEventPayload = {
  budgetDisplayName: string | null;
  costAmount: number | null;
  budgetAmount: number | null;
  alertThresholdExceeded: number | null;
  currencyCode: string | null;
  costIntervalStart: string | null;
};

export type GcpBudgetPubsubEventSummary = {
  source: "gcp-budget-pubsub-watch";
  statePath: string;
  available: boolean;
  lastCheckedAt: string | null;
  lastPublishTime: string | null;
  lastMessageId: string | null;
  pulledCount: number;
  ackedCount: number;
  lastNotified: boolean;
  payload: GcpBudgetPubsubEventPayload;
};

export type GcpBillingPayload = {
  object: string;
  source: string;
  table: string;
  capturedAt: string;
  ageSeconds: number;
  currency: string;
  totals: GcpBillingTotals;
  netTotals: GcpBillingTotals;
  creditTotals: GcpBillingTotals;
  topServices: {
    last7d: GcpBillingServiceCost[];
    monthToDate: GcpBillingServiceCost[];
  };
  daily: GcpBillingDailyCost[];
  budgetEvents: GcpBudgetPubsubEventSummary;
  fallback?: {
    kind: "budget_snapshot" | "export_empty";
    note: string;
  };
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

export type ManagedAppKind = "systemd" | "docker";

export type ManagedApp = {
  id: string;
  name: string;
  kind: ManagedAppKind;
  target: string;
  running: boolean;
  onBoot: boolean;
  available: boolean;
  statusDetail: string;
  bootDetail: string;
  memoryBytes: number | null;
  memoryLabel: string;
};

export type ManagedAppsPayload = {
  apps: ManagedApp[];
};
