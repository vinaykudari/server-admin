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

type CodexSourceUsageTotals = {
  requests: number;
  successes: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CodexSourceCategory = "api" | "openclaw" | "cli-codex" | "other";

export type CodexSourceUsageCategorySummary = CodexSourceUsageTotals & {
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

export type CodexSourceUsageSummary = {
  object: "codex.source.usage";
  source: "codex-multi-router-db";
  dbPath: string;
  lookbackHours: number;
  since: string;
  capturedAt: string;
  totals: CodexSourceUsageTotals;
  categories: CodexSourceUsageCategorySummary[];
  rows: CodexSourceUsageRow[];
  warning?: string;
};

export type CodexStatusLimit = {
  usedPercent: number | null;
  windowMinutes: number | null;
  resetsAtEpoch: number | null;
  resetsAt: string | null;
};

export type CodexStatusSummary = {
  object: string;
  source?: string;
  sessionLog?: string;
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

export type CodexAccountStatusSummary = {
  id: string;
  label: string;
  hasAuth: boolean | null;
  usage24h: CodexAccountUsage24h;
  status: CodexStatusSummary | null;
};

export type CodexAccountsSummary = {
  object: string;
  strategy: string;
  selected: {
    id: string;
    label: string;
    reason: string;
    score: number | null;
  } | null;
  capturedAt: string | null;
  accounts: CodexAccountStatusSummary[];
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

export type GcpBillingSummary = {
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

const CODEX_STATUS_URL =
  process.env.CODEX_STATUS_URL?.trim() || "https://server.vinaykudari.com/codex/v1/status";
const CODEX_ROUTER_ACCOUNTS_URL =
  process.env.CODEX_ROUTER_ACCOUNTS_URL?.trim() || "https://server.vinaykudari.com/codex/v1/router/accounts";
const CODEX_API_DOTENV_PATH = process.env.CODEX_API_DOTENV_PATH?.trim() || "/srv/apps/codex-openai-api/.env";
const CODEX_ROUTER_STATE_DB_PATH =
  process.env.CODEX_ROUTER_STATE_DB_PATH?.trim() || "/srv/apps/codex-multi-router/state/router.db";
const GCP_BILLING_EXPORT_TABLE = process.env.GCP_BILLING_EXPORT_TABLE?.trim() ?? "";
const GCP_BILLING_ACCOUNT_ID = process.env.GCP_BILLING_ACCOUNT_ID?.trim() ?? "";
const GCP_BILLING_PROJECT_ID = process.env.GCP_BILLING_PROJECT_ID?.trim() ?? "";
const GCP_BILLING_LOOKBACK_DAYS = Number(process.env.GCP_BILLING_LOOKBACK_DAYS ?? "45");
const GCP_BILLING_CACHE_MS = Number(process.env.GCP_BILLING_CACHE_MS ?? "300000");
const GCP_BILLING_ADC_PATH =
  process.env.GCP_BILLING_ADC_PATH?.trim() || "/root/.config/gcloud/application_default_credentials.json";
const GCP_BILLING_QUOTA_PROJECT = process.env.GCP_BILLING_QUOTA_PROJECT?.trim() ?? "";
const GCP_BUDGET_PUBSUB_STATE_PATH =
  process.env.GCP_BUDGET_PUBSUB_STATE_PATH?.trim() || "/var/lib/gcp-budget-pubsub-watch/state.json";

let cachedBearerToken: string | null | undefined;
let cachedGcpSummary: { atMs: number; data: GcpBillingSummary } | null = null;
let cachedGcpAccessToken: { token: string; expiresAtMs: number } | null = null;

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

function emptySourceTotals(): CodexSourceUsageTotals {
  return {
    requests: 0,
    successes: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addSourceTotals(target: CodexSourceUsageTotals, value: CodexSourceUsageTotals): void {
  target.requests += value.requests;
  target.successes += value.successes;
  target.inputTokens += value.inputTokens;
  target.cachedInputTokens += value.cachedInputTokens;
  target.outputTokens += value.outputTokens;
  target.totalTokens += value.totalTokens;
}

function classifySourceCategory(rawSource: string): CodexSourceCategory {
  const source = rawSource.trim().toLowerCase();
  if (!source) return "other";
  if (source.startsWith("openclaw")) return "openclaw";
  if (source.startsWith("api") || source.startsWith("app-server-gateway")) return "api";
  if (source.startsWith("cli")) return "cli-codex";
  return "other";
}

function sourceCategoryLabel(category: CodexSourceCategory): string {
  if (category === "api") return "API";
  if (category === "openclaw") return "OpenClaw";
  if (category === "cli-codex") return "CLI Codex";
  return "Other";
}

type RouterUsageSqlRow = {
  accountId: string;
  source: string;
  requests: number;
  successes: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const ROUTER_USAGE_SQL_SCRIPT = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
since = sys.argv[2]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    rows = conn.execute(
        """
        SELECT
            account_id AS account_id,
            source AS source,
            COUNT(*) AS requests,
            COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS successes,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM invocation_events
        WHERE created_at >= ?
        GROUP BY account_id, source
        ORDER BY total_tokens DESC, requests DESC
        """,
        (since,),
    ).fetchall()
    payload = [dict(row) for row in rows]
finally:
    conn.close()

print(json.dumps(payload, separators=(",", ":")))
`.trim();

async function queryRouterUsageRows(dbPath: string, sinceIso: string): Promise<RouterUsageSqlRow[]> {
  const { stdout } = await execFileAsync("python3", ["-c", ROUTER_USAGE_SQL_SCRIPT, dbPath, sinceIso], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];
  const output: RouterUsageSqlRow[] = [];

  for (const item of rows) {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    output.push({
      accountId: maybeString(row.account_id) ?? "unknown",
      source: maybeString(row.source) ?? "unknown",
      requests: maybeNumber(row.requests) ?? 0,
      successes: maybeNumber(row.successes) ?? 0,
      inputTokens: maybeNumber(row.input_tokens) ?? 0,
      cachedInputTokens: maybeNumber(row.cached_input_tokens) ?? 0,
      outputTokens: maybeNumber(row.output_tokens) ?? 0,
      totalTokens: maybeNumber(row.total_tokens) ?? 0,
    });
  }

  return output;
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

function maybeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function maybeBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function maybeString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function parseDotenvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

async function resolveCodexBearerToken(): Promise<string | null> {
  if (cachedBearerToken !== undefined) return cachedBearerToken;

  const fromEnv = process.env.COPENAI_API_KEY?.trim();
  if (fromEnv) {
    cachedBearerToken = fromEnv;
    return cachedBearerToken;
  }

  try {
    const content = await fs.readFile(CODEX_API_DOTENV_PATH, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotenvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (key === "COPENAI_API_KEY" && value.trim()) {
        cachedBearerToken = value.trim();
        return cachedBearerToken;
      }
    }
  } catch {
    // ignore
  }

  cachedBearerToken = null;
  return cachedBearerToken;
}

function parseCodexStatusPayload(raw: unknown): CodexStatusSummary {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limits = (obj.limits && typeof obj.limits === "object" ? obj.limits : {}) as Record<string, unknown>;
  const fiveHour = (limits.five_hour && typeof limits.five_hour === "object"
    ? limits.five_hour
    : {}) as Record<string, unknown>;
  const weekly = (limits.weekly && typeof limits.weekly === "object" ? limits.weekly : {}) as Record<string, unknown>;
  const credits = (obj.credits && typeof obj.credits === "object" ? obj.credits : {}) as Record<string, unknown>;
  const totals = (obj.totals && typeof obj.totals === "object" ? obj.totals : {}) as Record<string, unknown>;

  return {
    object: maybeString(obj.object) ?? "codex.status",
    source: maybeString(obj.source) ?? undefined,
    sessionLog: maybeString(obj.session_log) ?? undefined,
    capturedAt: maybeString(obj.captured_at),
    ageSeconds: maybeNumber(obj.age_seconds),
    limits: {
      fiveHour: {
        usedPercent: maybeNumber(fiveHour.used_percent),
        windowMinutes: maybeNumber(fiveHour.window_minutes),
        resetsAtEpoch: maybeNumber(fiveHour.resets_at_epoch),
        resetsAt: maybeString(fiveHour.resets_at),
      },
      weekly: {
        usedPercent: maybeNumber(weekly.used_percent),
        windowMinutes: maybeNumber(weekly.window_minutes),
        resetsAtEpoch: maybeNumber(weekly.resets_at_epoch),
        resetsAt: maybeString(weekly.resets_at),
      },
    },
    credits: {
      hasCredits: maybeBool(credits.has_credits),
      unlimited: maybeBool(credits.unlimited),
      balance: maybeNumber(credits.balance),
    },
    totals: {
      inputTokens: maybeNumber(totals.input_tokens),
      cachedInputTokens: maybeNumber(totals.cached_input_tokens),
      outputTokens: maybeNumber(totals.output_tokens),
      reasoningOutputTokens: maybeNumber(totals.reasoning_output_tokens),
      totalTokens: maybeNumber(totals.total_tokens),
    },
  };
}

function parseCodexAccountsPayload(raw: unknown): CodexAccountsSummary {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const selected = (obj.selected && typeof obj.selected === "object"
    ? obj.selected
    : null) as Record<string, unknown> | null;
  const rawAccounts = Array.isArray(obj.accounts) ? obj.accounts : [];

  const accounts: CodexAccountStatusSummary[] = rawAccounts.map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const usageRaw = (row.usage24h && typeof row.usage24h === "object" ? row.usage24h : {}) as Record<
      string,
      unknown
    >;
    const statusRaw = row.status;
    return {
      id: maybeString(row.id) ?? "unknown",
      label: maybeString(row.label) ?? maybeString(row.id) ?? "Unknown",
      hasAuth: maybeBool(row.hasAuth),
      usage24h: {
        requests: maybeNumber(usageRaw.requests) ?? 0,
        inputTokens: maybeNumber(usageRaw.input_tokens) ?? maybeNumber(usageRaw.inputTokens) ?? 0,
        outputTokens: maybeNumber(usageRaw.output_tokens) ?? maybeNumber(usageRaw.outputTokens) ?? 0,
        totalTokens: maybeNumber(usageRaw.total_tokens) ?? maybeNumber(usageRaw.totalTokens) ?? 0,
      },
      status:
        statusRaw && typeof statusRaw === "object"
          ? parseCodexStatusPayload(statusRaw)
          : null,
    };
  });

  return {
    object: maybeString(obj.object) ?? "codex.router.accounts",
    strategy: maybeString(obj.strategy) ?? "least_pressure",
    selected: selected
      ? {
          id: maybeString(selected.id) ?? "unknown",
          label: maybeString(selected.label) ?? "Unknown",
          reason: maybeString(selected.reason) ?? "unknown",
          score: maybeNumber(selected.score),
        }
      : null,
    capturedAt: maybeString(obj.capturedAt) ?? maybeString(obj.captured_at),
    accounts,
  };
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function assertBillingTable(value: string): string {
  const ok = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(value);
  if (!ok) {
    throw new Error(
      "GCP_BILLING_EXPORT_TABLE must be set as project.dataset.table (BigQuery billing export table).",
    );
  }
  return value;
}

type BillingRow = {
  day?: string;
  service?: string;
  grossCost?: string | number;
  credits?: string | number;
  netCost?: string | number;
  currency?: string;
};

type GcpAdcCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type BigQueryRow = {
  f?: Array<{ v?: unknown }>;
};

type BigQueryErrorDetail = {
  reason?: string;
  message?: string;
};

type BigQueryQueryResponse = {
  rows?: unknown[];
  pageToken?: string;
  jobComplete?: boolean;
  jobReference?: {
    jobId?: string;
    location?: string;
  };
  error?: {
    message?: string;
    errors?: BigQueryErrorDetail[];
  };
};

function dayUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function sumRange(
  rows: Array<{ day: string; grossCost: number; credits: number; netCost: number }>,
  startDay: string,
  endDay: string,
  field: "grossCost" | "credits" | "netCost",
): number {
  let total = 0;
  for (const row of rows) {
    if (row.day >= startDay && row.day <= endDay) total += row[field];
  }
  return total;
}

function topServicesInRange(
  rows: Array<{ day: string; service: string; grossCost: number; credits: number; netCost: number }>,
  startDay: string,
  endDay: string,
  limit = 6,
): GcpBillingServiceCost[] {
  const map = new Map<string, { grossCost: number; credits: number; netCost: number }>();
  for (const row of rows) {
    if (row.day < startDay || row.day > endDay) continue;
    const curr = map.get(row.service) ?? { grossCost: 0, credits: 0, netCost: 0 };
    curr.grossCost += row.grossCost;
    curr.credits += row.credits;
    curr.netCost += row.netCost;
    map.set(row.service, curr);
  }
  return [...map.entries()]
    .map(([service, values]) => ({ service, ...values }))
    .sort((a, b) => b.grossCost - a.grossCost)
    .slice(0, Math.max(1, Math.min(20, limit)));
}

function emptyBudgetPubsubEventSummary(): GcpBudgetPubsubEventSummary {
  return {
    source: "gcp-budget-pubsub-watch",
    statePath: GCP_BUDGET_PUBSUB_STATE_PATH,
    available: false,
    lastCheckedAt: null,
    lastPublishTime: null,
    lastMessageId: null,
    pulledCount: 0,
    ackedCount: 0,
    lastNotified: false,
    payload: {
      budgetDisplayName: null,
      costAmount: null,
      budgetAmount: null,
      alertThresholdExceeded: null,
      currencyCode: null,
      costIntervalStart: null,
    },
  };
}

async function readBudgetPubsubEventSummary(): Promise<GcpBudgetPubsubEventSummary> {
  let raw = "";
  try {
    raw = await fs.readFile(GCP_BUDGET_PUBSUB_STATE_PATH, "utf8");
  } catch {
    return emptyBudgetPubsubEventSummary();
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return emptyBudgetPubsubEventSummary();
  }

  const payloadRaw =
    parsed.lastPayload && typeof parsed.lastPayload === "object"
      ? (parsed.lastPayload as Record<string, unknown>)
      : {};

  const summary: GcpBudgetPubsubEventSummary = {
    source: "gcp-budget-pubsub-watch",
    statePath: GCP_BUDGET_PUBSUB_STATE_PATH,
    available: Boolean(maybeString(parsed.lastMessageId) || maybeString(parsed.lastPublishTime) || maybeString(payloadRaw.budgetDisplayName)),
    lastCheckedAt: maybeString(parsed.lastCheckedAt),
    lastPublishTime: maybeString(parsed.lastPublishTime),
    lastMessageId: maybeString(parsed.lastMessageId),
    pulledCount: maybeNumber(parsed.pulledCount) ?? 0,
    ackedCount: maybeNumber(parsed.ackedCount) ?? 0,
    lastNotified: maybeBool(parsed.lastNotified) ?? false,
    payload: {
      budgetDisplayName: maybeString(payloadRaw.budgetDisplayName),
      costAmount: maybeNumber(payloadRaw.costAmount),
      budgetAmount: maybeNumber(payloadRaw.budgetAmount),
      alertThresholdExceeded: maybeNumber(payloadRaw.alertThresholdExceeded),
      currencyCode: maybeString(payloadRaw.currencyCode),
      costIntervalStart: maybeString(payloadRaw.costIntervalStart),
    },
  };
  return summary;
}

function pendingGcpSummary(
  table: string,
  nowMs: number,
  budgetEvents: GcpBudgetPubsubEventSummary,
): GcpBillingSummary {
  return {
    object: "gcp.billing.usage",
    source: "bigquery-export-pending",
    table,
    capturedAt: new Date(nowMs).toISOString(),
    ageSeconds: 0,
    currency: "USD",
    totals: { today: 0, last7d: 0, monthToDate: 0 },
    netTotals: { today: 0, last7d: 0, monthToDate: 0 },
    creditTotals: { today: 0, last7d: 0, monthToDate: 0 },
    topServices: { last7d: [], monthToDate: [] },
    daily: [],
    budgetEvents,
  };
}

function applyBudgetSnapshotFallback(
  summary: GcpBillingSummary,
  budgetEvents: GcpBudgetPubsubEventSummary,
  nowMs: number,
): GcpBillingSummary {
  if (summary.totals.today > 0 || summary.totals.last7d > 0 || summary.totals.monthToDate > 0) {
    return summary;
  }

  const rawCost = budgetEvents.payload.costAmount;
  if (typeof rawCost !== "number" || !Number.isFinite(rawCost) || rawCost <= 0) {
    return summary;
  }

  const cost = Math.max(0, rawCost);
  const today = dayUtc(nowMs);
  const sevenDaysAgo = dayUtc(nowMs - 6 * 24 * 60 * 60 * 1000);
  const startDayRaw = budgetEvents.payload.costIntervalStart?.slice(0, 10) ?? "";
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(startDayRaw) ? startDayRaw : null;
  const inferredToday = startDay === today ? cost : 0;
  const inferredLast7d = startDay && startDay >= sevenDaysAgo ? cost : 0;
  const currency = budgetEvents.payload.currencyCode ?? summary.currency;

  return {
    ...summary,
    source: `${summary.source}+budget-snapshot`,
    currency,
    totals: {
      today: inferredToday,
      last7d: inferredLast7d,
      monthToDate: cost,
    },
    netTotals: {
      today: inferredToday,
      last7d: inferredLast7d,
      monthToDate: cost,
    },
    fallback: {
      kind: "budget_snapshot",
      note: "Using budget snapshot fallback until billing export rows arrive.",
    },
  };
}

function applyEmptyExportFallback(summary: GcpBillingSummary): GcpBillingSummary {
  const hasData =
    summary.totals.today > 0 ||
    summary.totals.last7d > 0 ||
    summary.totals.monthToDate > 0 ||
    summary.daily.length > 0;
  if (hasData) return summary;
  if (summary.fallback?.kind === "budget_snapshot") return summary;

  return {
    ...summary,
    source: summary.source === "bigquery-export" ? "bigquery-export-empty" : `${summary.source}+empty`,
    fallback: {
      kind: "export_empty",
      note: "Billing export table is configured but has no rows yet. Budget Pub/Sub fallback will populate after the first threshold notification.",
    },
  };
}

function parseBillingTableParts(table: string): { projectId: string; datasetId: string; tableId: string } {
  const [projectId, datasetId, tableId] = table.split(".", 3);
  if (!projectId || !datasetId || !tableId) {
    throw new Error("Invalid GCP_BILLING_EXPORT_TABLE format.");
  }
  return { projectId, datasetId, tableId };
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

function readGcpAdcCredentials(raw: string): GcpAdcCredentials {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const clientId = maybeString(parsed.client_id);
  const clientSecret = maybeString(parsed.client_secret);
  const refreshToken = maybeString(parsed.refresh_token);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`ADC file at ${GCP_BILLING_ADC_PATH} is missing client_id/client_secret/refresh_token.`);
  }
  return { clientId, clientSecret, refreshToken };
}

async function getGcpAccessToken(): Promise<string> {
  const nowMs = Date.now();
  if (cachedGcpAccessToken && nowMs < cachedGcpAccessToken.expiresAtMs) {
    return cachedGcpAccessToken.token;
  }

  const raw = await fs.readFile(GCP_BILLING_ADC_PATH, "utf8");
  const creds = readGcpAdcCredentials(raw);
  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`GCP OAuth refresh failed (HTTP ${response.status}).`);
  }

  const token = maybeString(payload.access_token);
  if (!token) {
    throw new Error("GCP OAuth refresh succeeded without access_token.");
  }

  const expiresInSec = maybeNumber(payload.expires_in) ?? 3600;
  const validForMs = Math.max(60, expiresInSec - 60) * 1000;
  cachedGcpAccessToken = { token, expiresAtMs: nowMs + validForMs };
  return token;
}

function isBigQueryTableNotFound(status: number, body: unknown): boolean {
  if (status === 404) return true;
  if (!body || typeof body !== "object") return false;
  const root = body as BigQueryQueryResponse;
  const message = maybeString(root.error?.message)?.toLowerCase() ?? "";
  if (message.includes("not found: table")) return true;
  const reasons = Array.isArray(root.error?.errors) ? root.error?.errors : [];
  return reasons.some((item) => item.reason?.toLowerCase() === "notfound");
}

function parseBigQueryRows(rows: unknown[]): BillingRow[] {
  return rows.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as BigQueryRow;
    const fields = Array.isArray(raw.f) ? raw.f : [];
    const day = fields[0]?.v;
    const service = fields[1]?.v;
    const grossCost = fields[2]?.v;
    const credits = fields[3]?.v;
    const netCost = fields[4]?.v;
    const currency = fields[5]?.v;
    return {
      day: typeof day === "string" ? day : undefined,
      service: typeof service === "string" ? service : undefined,
      grossCost: typeof grossCost === "string" || typeof grossCost === "number" ? grossCost : undefined,
      credits: typeof credits === "string" || typeof credits === "number" ? credits : undefined,
      netCost: typeof netCost === "string" || typeof netCost === "number" ? netCost : undefined,
      currency: typeof currency === "string" ? currency : undefined,
    };
  });
}

async function runBigQuerySql(
  table: string,
  sql: string,
): Promise<{ rows: BillingRow[]; notFound: boolean }> {
  const { projectId } = parseBillingTableParts(table);
  const quotaProject = GCP_BILLING_QUOTA_PROJECT || projectId;
  const token = await getGcpAccessToken();
  const baseUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Goog-User-Project": quotaProject,
  };

  const queryResponse = await fetch(`${baseUrl}/queries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      timeoutMs: 45_000,
      maxResults: 10_000,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const queryBody = (await queryResponse.json().catch(() => ({}))) as BigQueryQueryResponse;
  if (!queryResponse.ok) {
    if (isBigQueryTableNotFound(queryResponse.status, queryBody)) {
      return { rows: [], notFound: true };
    }
    throw new Error(`BigQuery query failed (HTTP ${queryResponse.status}).`);
  }
  if (isBigQueryTableNotFound(queryResponse.status, queryBody)) {
    return { rows: [], notFound: true };
  }

  let current = queryBody;
  const allRows: BillingRow[] = parseBigQueryRows(Array.isArray(current.rows) ? current.rows : []);

  let pollsRemaining = 30;
  while (current.jobComplete === false && pollsRemaining > 0) {
    const jobId = current.jobReference?.jobId;
    if (!jobId) {
      throw new Error("BigQuery query did not provide jobReference.jobId.");
    }
    const params = new URLSearchParams({ maxResults: "10000" });
    if (current.jobReference?.location) params.set("location", current.jobReference.location);
    await sleep(1_000);
    const pollResponse = await fetch(`${baseUrl}/queries/${encodeURIComponent(jobId)}?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Goog-User-Project": quotaProject,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const pollBody = (await pollResponse.json().catch(() => ({}))) as BigQueryQueryResponse;
    if (!pollResponse.ok) {
      throw new Error(`BigQuery getQueryResults failed (HTTP ${pollResponse.status}).`);
    }
    current = pollBody;
    allRows.push(...parseBigQueryRows(Array.isArray(current.rows) ? current.rows : []));
    pollsRemaining -= 1;
  }
  if (current.jobComplete === false) {
    throw new Error("BigQuery query timed out waiting for results.");
  }

  let nextPageToken = current.pageToken;
  while (nextPageToken) {
    const jobId = current.jobReference?.jobId;
    if (!jobId) {
      throw new Error("BigQuery pagination missing jobReference.jobId.");
    }
    const params = new URLSearchParams({
      maxResults: "10000",
      pageToken: nextPageToken,
    });
    if (current.jobReference?.location) params.set("location", current.jobReference.location);
    const pageResponse = await fetch(`${baseUrl}/queries/${encodeURIComponent(jobId)}?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Goog-User-Project": quotaProject,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const pageBody = (await pageResponse.json().catch(() => ({}))) as BigQueryQueryResponse;
    if (!pageResponse.ok) {
      throw new Error(`BigQuery pagination failed (HTTP ${pageResponse.status}).`);
    }
    allRows.push(...parseBigQueryRows(Array.isArray(pageBody.rows) ? pageBody.rows : []));
    current = pageBody;
    nextPageToken = pageBody.pageToken;
  }

  return { rows: allRows, notFound: false };
}

export async function getCodexStatusSummary(refresh = false, accountId?: string): Promise<CodexStatusSummary> {
  const bearer = await resolveCodexBearerToken();
  if (!bearer) {
    throw new Error(`Missing COPENAI_API_KEY (env or ${CODEX_API_DOTENV_PATH}).`);
  }

  const url = new URL(CODEX_STATUS_URL);
  if (accountId && accountId.trim()) {
    url.searchParams.set("account", accountId.trim());
  }
  if (refresh) {
    url.searchParams.set("refresh", "true");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail ? `Codex status fetch failed: ${detail}` : `Codex status fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as unknown;
  return parseCodexStatusPayload(body);
}

export async function getCodexAccountsSummary(refresh = false): Promise<CodexAccountsSummary> {
  const bearer = await resolveCodexBearerToken();
  if (!bearer) {
    throw new Error(`Missing COPENAI_API_KEY (env or ${CODEX_API_DOTENV_PATH}).`);
  }

  const url = new URL(CODEX_ROUTER_ACCOUNTS_URL);
  if (refresh) {
    url.searchParams.set("refresh", "true");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(
      detail
        ? `Codex accounts fetch failed: ${detail}`
        : `Codex accounts fetch failed: ${response.status}`,
    );
  }

  const body = (await response.json()) as unknown;
  return parseCodexAccountsPayload(body);
}

export async function getCodexSourceUsageSummary(lookbackHours = 24): Promise<CodexSourceUsageSummary> {
  const nowMs = Date.now();
  const boundedLookback = Number.isFinite(lookbackHours)
    ? Math.max(1, Math.min(24 * 30, Math.floor(lookbackHours)))
    : 24;
  const sinceIso = new Date(nowMs - boundedLookback * 60 * 60 * 1000).toISOString();
  const capturedAt = new Date(nowMs).toISOString();

  let rowsRaw: RouterUsageSqlRow[];
  try {
    rowsRaw = await queryRouterUsageRows(CODEX_ROUTER_STATE_DB_PATH, sinceIso);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      object: "codex.source.usage",
      source: "codex-multi-router-db",
      dbPath: CODEX_ROUTER_STATE_DB_PATH,
      lookbackHours: boundedLookback,
      since: sinceIso,
      capturedAt,
      totals: emptySourceTotals(),
      categories: [
        {
          category: "api",
          label: sourceCategoryLabel("api"),
          ...emptySourceTotals(),
          accountCount: 0,
          sourceCount: 0,
          successRate: 0,
          percentOfTotal: 0,
        },
        {
          category: "openclaw",
          label: sourceCategoryLabel("openclaw"),
          ...emptySourceTotals(),
          accountCount: 0,
          sourceCount: 0,
          successRate: 0,
          percentOfTotal: 0,
        },
        {
          category: "cli-codex",
          label: sourceCategoryLabel("cli-codex"),
          ...emptySourceTotals(),
          accountCount: 0,
          sourceCount: 0,
          successRate: 0,
          percentOfTotal: 0,
        },
        {
          category: "other",
          label: sourceCategoryLabel("other"),
          ...emptySourceTotals(),
          accountCount: 0,
          sourceCount: 0,
          successRate: 0,
          percentOfTotal: 0,
        },
      ],
      rows: [],
      warning: `Codex source analytics unavailable: ${message}`,
    };
  }

  const rows: CodexSourceUsageRow[] = rowsRaw.map((row) => {
    const requests = Math.max(0, row.requests);
    const successes = Math.max(0, row.successes);
    return {
      accountId: row.accountId,
      source: row.source,
      category: classifySourceCategory(row.source),
      requests,
      successes,
      inputTokens: Math.max(0, row.inputTokens),
      cachedInputTokens: Math.max(0, row.cachedInputTokens),
      outputTokens: Math.max(0, row.outputTokens),
      totalTokens: Math.max(0, row.totalTokens),
      successRate: requests > 0 ? successes / requests : 0,
    };
  });
  rows.sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests || a.source.localeCompare(b.source));

  const totals = emptySourceTotals();
  for (const row of rows) {
    addSourceTotals(totals, row);
  }

  const categoriesSeed: CodexSourceCategory[] = ["api", "openclaw", "cli-codex", "other"];
  const categoryMap = new Map<
    CodexSourceCategory,
    {
      totals: CodexSourceUsageTotals;
      accounts: Set<string>;
      sources: Set<string>;
    }
  >();

  for (const category of categoriesSeed) {
    categoryMap.set(category, {
      totals: emptySourceTotals(),
      accounts: new Set<string>(),
      sources: new Set<string>(),
    });
  }

  for (const row of rows) {
    const entry = categoryMap.get(row.category)!;
    addSourceTotals(entry.totals, row);
    entry.accounts.add(row.accountId);
    entry.sources.add(row.source);
  }

  const categories = [...categoryMap.entries()]
    .map(([category, entry]) => {
      const requests = entry.totals.requests;
      const successes = entry.totals.successes;
      return {
        category,
        label: sourceCategoryLabel(category),
        ...entry.totals,
        accountCount: entry.accounts.size,
        sourceCount: entry.sources.size,
        successRate: requests > 0 ? successes / requests : 0,
        percentOfTotal: totals.totalTokens > 0 ? entry.totals.totalTokens / totals.totalTokens : 0,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests || a.label.localeCompare(b.label));

  return {
    object: "codex.source.usage",
    source: "codex-multi-router-db",
    dbPath: CODEX_ROUTER_STATE_DB_PATH,
    lookbackHours: boundedLookback,
    since: sinceIso,
    capturedAt,
    totals,
    categories,
    rows,
  };
}

export async function getGcpBillingSummary(refresh = false): Promise<GcpBillingSummary> {
  const nowMs = Date.now();
  if (!refresh && cachedGcpSummary && nowMs - cachedGcpSummary.atMs < GCP_BILLING_CACHE_MS) {
    return {
      ...cachedGcpSummary.data,
      ageSeconds: Math.max(0, Math.floor((nowMs - cachedGcpSummary.atMs) / 1000)),
    };
  }

  const table = assertBillingTable(GCP_BILLING_EXPORT_TABLE);
  const budgetEvents = await readBudgetPubsubEventSummary();
  const lookback = Number.isFinite(GCP_BILLING_LOOKBACK_DAYS)
    ? Math.max(7, Math.min(120, GCP_BILLING_LOOKBACK_DAYS))
    : 45;

  const whereParts = [`usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookback} DAY)`];
  if (GCP_BILLING_ACCOUNT_ID) whereParts.push(`billing_account_id = ${sqlString(GCP_BILLING_ACCOUNT_ID)}`);
  if (GCP_BILLING_PROJECT_ID) whereParts.push(`project.id = ${sqlString(GCP_BILLING_PROJECT_ID)}`);

  const sql = `
SELECT
  CAST(DATE(usage_start_time) AS STRING) AS day,
  IFNULL(service.description, 'Unknown') AS service,
  ROUND(SUM(cost), 6) AS gross_cost,
  ROUND(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) AS c)), 6) AS credits,
  ROUND(SUM(cost) + SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) AS c)), 6) AS net_cost,
  ANY_VALUE(currency) AS currency
FROM \`${table}\`
WHERE ${whereParts.join(" AND ")}
GROUP BY day, service
ORDER BY day DESC, gross_cost DESC
	`.trim();

  const result = await runBigQuerySql(table, sql);
  if (result.notFound) {
    const pending = pendingGcpSummary(table, nowMs, budgetEvents);
    const summary = applyBudgetSnapshotFallback(pending, budgetEvents, nowMs);
    cachedGcpSummary = { atMs: nowMs, data: summary };
    return summary;
  }
  const rawRows = result.rows;

  const rows = rawRows
    .map((row) => {
      const day = typeof row.day === "string" ? row.day : "";
      const service = typeof row.service === "string" ? row.service : "Unknown";
      const grossCostNum =
        typeof row.grossCost === "number" ? row.grossCost : typeof row.grossCost === "string" ? Number(row.grossCost) : NaN;
      const creditsNum =
        typeof row.credits === "number" ? row.credits : typeof row.credits === "string" ? Number(row.credits) : NaN;
      const netCostNum =
        typeof row.netCost === "number" ? row.netCost : typeof row.netCost === "string" ? Number(row.netCost) : NaN;
      const currency = typeof row.currency === "string" && row.currency ? row.currency : "USD";
      const grossCost = Number.isFinite(grossCostNum) ? grossCostNum : 0;
      const credits = Number.isFinite(creditsNum) ? creditsNum : 0;
      const netCost = Number.isFinite(netCostNum) ? netCostNum : grossCost + credits;
      return {
        day,
        service,
        grossCost,
        credits,
        netCost,
        currency,
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day));

  const currency = rows[0]?.currency ?? "USD";

  const dailyMap = new Map<string, { grossCost: number; credits: number; netCost: number }>();
  for (const row of rows) {
    const curr = dailyMap.get(row.day) ?? { grossCost: 0, credits: 0, netCost: 0 };
    curr.grossCost += row.grossCost;
    curr.credits += row.credits;
    curr.netCost += row.netCost;
    dailyMap.set(row.day, curr);
  }
  const daily = [...dailyMap.entries()]
    .map(([day, values]) => ({ day, ...values }))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 45);

  const today = dayUtc(nowMs);
  const sevenDaysAgo = dayUtc(nowMs - 6 * 24 * 60 * 60 * 1000);
  const monthStart = `${today.slice(0, 8)}01`;

  const summary: GcpBillingSummary = {
    object: "gcp.billing.usage",
    source: "bigquery-export",
    table,
    capturedAt: new Date(nowMs).toISOString(),
    ageSeconds: 0,
    currency,
    totals: {
      today: sumRange(daily, today, today, "grossCost"),
      last7d: sumRange(daily, sevenDaysAgo, today, "grossCost"),
      monthToDate: sumRange(daily, monthStart, today, "grossCost"),
    },
    netTotals: {
      today: sumRange(daily, today, today, "netCost"),
      last7d: sumRange(daily, sevenDaysAgo, today, "netCost"),
      monthToDate: sumRange(daily, monthStart, today, "netCost"),
    },
    creditTotals: {
      today: sumRange(daily, today, today, "credits"),
      last7d: sumRange(daily, sevenDaysAgo, today, "credits"),
      monthToDate: sumRange(daily, monthStart, today, "credits"),
    },
    topServices: {
      last7d: topServicesInRange(rows, sevenDaysAgo, today, 6),
      monthToDate: topServicesInRange(rows, monthStart, today, 6),
    },
    daily,
    budgetEvents,
  };

  const finalSummary = applyBudgetSnapshotFallback(summary, budgetEvents, nowMs);
  const finalWithEmptyFallback = applyEmptyExportFallback(finalSummary);
  cachedGcpSummary = { atMs: nowMs, data: finalWithEmptyFallback };
  return finalWithEmptyFallback;
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
