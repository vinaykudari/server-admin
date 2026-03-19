import { useEffect, useMemo, useState } from "react";

import { useCodexUsage } from "../hooks/useCodexUsage";
import { fetchGcpBilling } from "../services/api";
import type {
  CodexAccountStatusPayload,
  CodexSourceUsagePayload,
  CodexStatusLimit,
  GcpBillingPayload,
  GcpBillingServiceCost,
} from "../types";
import { Panel } from "./Panel";
import { RefreshIcon } from "./RefreshIcon";

import "./CodexUsagePanel.css";

const USAGE_COPY = {
  unknown: "Unknown",
  codexUsageTitle: "Codex Usage",
  accountMetaLabel: "Account",
  primaryAccountLabel: "Primary",
  gcpTitle: "GCP Usage",
  accountStatusUnavailable: "No status data available yet for this account.",
  accountLoading: "Loading usage...",
  accountStatusErrorPrefix: "Plan status unavailable:",
  gcpLoading: "Loading GCP usage...",
  gcpUnavailablePrefix: "GCP usage unavailable:",
  gcpNoData: "No GCP usage data available yet.",
  gcpNoServiceCosts: "No service costs yet.",
  gcpBudgetEventsTitle: "Budget Pub/Sub Events",
  gcpNoBudgetEvents: "No budget events received yet.",
  gcpAwaitingData: "Awaiting Data",
  gcpExportEmptyState: "Export empty, waiting for first row/message.",
  sourceUsageTitle: "Token Sources",
  sourceUsageNoData: "No source usage data in this window.",
  sourceUsageUnavailablePrefix: "Source analytics unavailable:",
  sourceUsageWindowLabelPrefix: "Window",
  sourceUsageRequests: "Requests",
  sourceUsageTokens: "Total Tokens",
  sourceUsageInputTokens: "Input",
  sourceUsageOutputTokens: "Output",
  sourceUsageShare: "Share",
  sourceUsageSuccess: "Success",
  sourceUsageAccountNoData: "No non-zero category usage for this account in this window.",
  refreshCodex: "Refresh Codex usage live",
  refreshGcp: "Refresh GCP usage live",
} as const;

const getAccountLabel = (account: CodexAccountStatusPayload): string =>
  account.id.trim().toLowerCase() === "primary" ? USAGE_COPY.primaryAccountLabel : account.label;
const getViewLetter = (view: ViewItem): string => {
  if (view.kind === "gcp") return "G";
  const label = getAccountLabel(view.account).trim();
  return label ? label[0]!.toUpperCase() : "A";
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const pct = (n: number | null) => (typeof n === "number" && Number.isFinite(n) ? clamp(n, 0, 100) : null);

const resetIn = (value: string | null | undefined, mode: "default" | "days" = "default") => {
  if (!value) return USAGE_COPY.unknown;
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return USAGE_COPY.unknown;

  const diffMs = target - Date.now();
  if (diffMs <= 0) return "now";

  if (mode === "days") {
    const days = diffMs / (24 * 60 * 60 * 1000);
    if (days < 1) return "<1d";
    if (days >= 10) return `${Math.round(days)}d`;
    return `${days.toFixed(1)}d`;
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes <= 0) return "<1m";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

const normalizeCost = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatCost = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(normalizeCost(value));

const formatPercent = (value: number) => `${Math.max(0, Math.min(100, value * 100)).toFixed(1)}%`;
const formatTokenCount = (value: number) => {
  if (!Number.isFinite(value)) return USAGE_COPY.unknown;
  const n = Math.max(0, value);
  if (n < 10_000) return Math.round(n).toLocaleString();
  const text = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n >= 100_000 ? 0 : 1,
  }).format(n);
  return text.replace("K", "k");
};

type AccountSourceCategoryRow = {
  category: string;
  label: string;
  requests: number;
  successes: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  successRate: number;
  shareOfAccount: number;
};

type OpenClawAgentUsageRow = {
  agent: string;
  requests: number;
  successes: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  successRate: number;
  shareOfOpenClaw: number;
};

const topServices = (data: GcpBillingPayload): GcpBillingServiceCost[] =>
  data.topServices.monthToDate.length > 0 ? data.topServices.monthToDate : data.topServices.last7d;

const StatusOrb = ({
  title,
  limit,
  className,
  resetMode = "default",
}: {
  title: string;
  limit: CodexStatusLimit;
  className: string;
  resetMode?: "default" | "days";
}) => {
  const percent = pct(limit.usedPercent);
  const ring = percent == null ? 0 : percent;
  const label = percent == null ? "--" : `${Math.round(percent)}%`;

  return (
    <section className={`statusOrb ${className}`} style={{ ["--ring" as string]: `${ring}%` }}>
      <div className="statusOrb__head">
        <div className="statusOrb__title">{title}</div>
      </div>

      <div className="statusOrb__body">
        <div className="statusOrb__ring">
          <div className="statusOrb__core">
            <div className="statusOrb__value">{label}</div>
            <div className="statusOrb__caption">used</div>
          </div>
        </div>

        <div className="statusOrb__text">
          <div className="statusOrb__resetLabel">Resets</div>
          <div className="statusOrb__resetValue">in {resetIn(limit.resetsAt, resetMode)}</div>
        </div>
      </div>
    </section>
  );
};

function SourceUsageTable({
  sourceUsage,
  sourceUsageError,
  currentAccount,
}: {
  sourceUsage: CodexSourceUsagePayload | null;
  sourceUsageError: string | null;
  currentAccount: CodexAccountStatusPayload;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [currentAccount.id]);

  const currentAccountRows = useMemo(
    () =>
      (sourceUsage?.rows ?? []).filter(
        (row) => row.accountId === currentAccount.id && (row.totalTokens > 0 || row.requests > 0),
      ),
    [currentAccount.id, sourceUsage],
  );

  const categories = useMemo<AccountSourceCategoryRow[]>(() => {
    if (!sourceUsage) return [];
    const categoryLabelById = new Map(sourceUsage.categories.map((c) => [c.category, c.label]));
    const byCategory = new Map<string, AccountSourceCategoryRow>();

    for (const row of currentAccountRows) {
      const categoryEntry =
        byCategory.get(row.category) ??
        {
          category: row.category,
          label: categoryLabelById.get(row.category) ?? row.category,
          requests: 0,
          successes: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          successRate: 0,
          shareOfAccount: 0,
        };

      categoryEntry.requests += row.requests;
      categoryEntry.successes += row.successes;
      categoryEntry.inputTokens += row.inputTokens;
      categoryEntry.outputTokens += row.outputTokens;
      categoryEntry.totalTokens += row.totalTokens;
      byCategory.set(row.category, categoryEntry);
    }

    const totalTokens = [...byCategory.values()].reduce((sum, row) => sum + row.totalTokens, 0);
    return [...byCategory.values()]
      .filter((row) => row.totalTokens > 0 || row.requests > 0)
      .map((row) => ({
        ...row,
        successRate: row.requests > 0 ? row.successes / row.requests : 0,
        shareOfAccount: totalTokens > 0 ? row.totalTokens / totalTokens : 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests || a.label.localeCompare(b.label));
  }, [currentAccountRows, sourceUsage]);

  const openclawAgents = useMemo<OpenClawAgentUsageRow[]>(() => {
    const agentRows = currentAccountRows.filter((row) => row.category === "openclaw");
    const byAgent = new Map<string, OpenClawAgentUsageRow>();

    const parseAgent = (source: string): string => {
      const trimmed = source.trim();
      if (!trimmed) return "unknown";

      if (/^openclaw$/i.test(trimmed)) return "(unscoped)";

      const colonMatch = trimmed.match(/^openclaw:([^:]+)(?::|$)/i);
      if (colonMatch?.[1]) return colonMatch[1];

      const slashMatch = trimmed.match(/^openclaw\/([^/]+)(?:\/|$)/i);
      if (slashMatch?.[1]) return slashMatch[1];

      // Final fallback: preserve the raw source so new formats still appear as distinct rows.
      return trimmed;
    };

    for (const row of agentRows) {
      const agent = parseAgent(row.source);
      const entry =
        byAgent.get(agent) ??
        {
          agent,
          requests: 0,
          successes: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          successRate: 0,
          shareOfOpenClaw: 0,
        };
      entry.requests += row.requests;
      entry.successes += row.successes;
      entry.inputTokens += row.inputTokens;
      entry.outputTokens += row.outputTokens;
      entry.totalTokens += row.totalTokens;
      byAgent.set(agent, entry);
    }

    const openclawTotal = [...byAgent.values()].reduce((sum, row) => sum + row.totalTokens, 0);
    return [...byAgent.values()]
      .filter((row) => row.totalTokens > 0 || row.requests > 0)
      .map((row) => ({
        ...row,
        successRate: row.requests > 0 ? row.successes / row.requests : 0,
        shareOfOpenClaw: openclawTotal > 0 ? row.totalTokens / openclawTotal : 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests || a.agent.localeCompare(b.agent));
  }, [currentAccountRows]);

  const totalTokens = categories.reduce((sum, row) => sum + row.totalTokens, 0);
  const totalRequests = categories.reduce((sum, row) => sum + row.requests, 0);
  const hasData = categories.length > 0;
  const currentLabel = getAccountLabel(currentAccount);

  return (
    <div className="sourceUsage">
      <div className="sourceUsage__header">
        <div className="sourceUsage__title">
          {USAGE_COPY.sourceUsageTitle} - {currentLabel}
        </div>
        {sourceUsage ? (
          <div className="sourceUsage__window">
            {USAGE_COPY.sourceUsageWindowLabelPrefix}: {sourceUsage.lookbackHours}h
          </div>
        ) : null}
      </div>

      <div className="sourceUsage__summaryBar">
        <div className="sourceUsage__hint">
          {formatTokenCount(totalTokens)} tok • {totalRequests.toLocaleString()} req
        </div>
        {!sourceUsageError && sourceUsage && hasData && (
          <button className="button button--ghost sourceUsage__toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide Details" : "Show Details"}
          </button>
        )}
      </div>

      {sourceUsageError && (
        <div className="state state--error">
          {USAGE_COPY.sourceUsageUnavailablePrefix} {sourceUsageError}
        </div>
      )}
      {!sourceUsageError && sourceUsage?.warning && <div className="state">{sourceUsage.warning}</div>}

      {!sourceUsageError && sourceUsage && !hasData && (
        <div className="sourceUsage__empty">{USAGE_COPY.sourceUsageNoData}</div>
      )}

      {!sourceUsageError && sourceUsage && hasData && (
        <div className="sourceUsage__detailsWrap">
          {expanded && (
            <>
              <div className="sourceUsage__tableWrap">
                <table className="sourceUsage__table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>{USAGE_COPY.sourceUsageRequests}</th>
                      <th>{USAGE_COPY.sourceUsageTokens}</th>
                      <th>{USAGE_COPY.sourceUsageInputTokens}</th>
                      <th>{USAGE_COPY.sourceUsageOutputTokens}</th>
                      <th>{USAGE_COPY.sourceUsageShare}</th>
                      <th>{USAGE_COPY.sourceUsageSuccess}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((row) => (
                      <tr key={`${currentAccount.id}-${row.category}`}>
                        <td>{row.label}</td>
                        <td>{row.requests.toLocaleString()}</td>
                        <td>{formatTokenCount(row.totalTokens)}</td>
                        <td>{formatTokenCount(row.inputTokens)}</td>
                        <td>{formatTokenCount(row.outputTokens)}</td>
                        <td>{formatPercent(row.shareOfAccount)}</td>
                        <td>{formatPercent(row.successRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {openclawAgents.length > 0 && (
                <div className="sourceUsage__tableWrap">
                  <table className="sourceUsage__table">
                    <thead>
                      <tr>
                        <th>OpenClaw Agent</th>
                        <th>{USAGE_COPY.sourceUsageRequests}</th>
                        <th>{USAGE_COPY.sourceUsageTokens}</th>
                        <th>{USAGE_COPY.sourceUsageInputTokens}</th>
                        <th>{USAGE_COPY.sourceUsageOutputTokens}</th>
                        <th>{USAGE_COPY.sourceUsageShare}</th>
                        <th>{USAGE_COPY.sourceUsageSuccess}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openclawAgents.map((row) => (
                        <tr key={`${currentAccount.id}-openclaw-agent-${row.agent}`}>
                          <td>{row.agent}</td>
                          <td>{row.requests.toLocaleString()}</td>
                          <td>{formatTokenCount(row.totalTokens)}</td>
                          <td>{formatTokenCount(row.inputTokens)}</td>
                          <td>{formatTokenCount(row.outputTokens)}</td>
                          <td>{formatPercent(row.shareOfOpenClaw)}</td>
                          <td>{formatPercent(row.successRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CodexAccountView({
  account,
  sourceUsage,
  sourceUsageError,
}: {
  account: CodexAccountStatusPayload;
  sourceUsage: CodexSourceUsagePayload | null;
  sourceUsageError: string | null;
}) {
  const status = account.status;
  const accountLabel = getAccountLabel(account);
  const showFallback24h = !sourceUsage || !!sourceUsageError;

  return (
    <div className="usage">
      <section className="usage__hero">
        <div className="usage__heroBg" />
        <div className="usage__meta">
          <div className="usage__metaLabel">
            {USAGE_COPY.accountMetaLabel}: {accountLabel}
          </div>
        </div>

        {!status && <div className="state">{USAGE_COPY.accountStatusUnavailable}</div>}

        {status && (
          <>
            <div className="usage__orbs">
              <StatusOrb title="5-hour Limit" limit={status.limits.fiveHour} className="statusOrb--five" />
              <StatusOrb title="Weekly Limit" limit={status.limits.weekly} className="statusOrb--week" resetMode="days" />
            </div>
            {showFallback24h && (
              <div className="usage__miniStat">
                24h: {formatTokenCount(account.usage24h.totalTokens)} tok • {account.usage24h.requests.toLocaleString()} req
              </div>
            )}
          </>
        )}
      </section>
      <SourceUsageTable sourceUsage={sourceUsage} sourceUsageError={sourceUsageError} currentAccount={account} />
    </div>
  );
}

type ViewItem = { kind: "account"; account: CodexAccountStatusPayload } | { kind: "gcp" };

export function CodexUsagePanel() {
  const { accounts, sourceUsage, loading, statusError, sourceUsageError, refresh } = useCodexUsage();
  const [viewIndex, setViewIndex] = useState(0);
  const [gcp, setGcp] = useState<GcpBillingPayload | null>(null);
  const [gcpLoading, setGcpLoading] = useState(false);
  const [gcpError, setGcpError] = useState<string | null>(null);
  const [showGcpDetails, setShowGcpDetails] = useState(false);

  const views = useMemo<ViewItem[]>(() => {
    const accountViews: ViewItem[] = (accounts?.accounts ?? []).map((account) => ({ kind: "account", account }));
    return [...accountViews, { kind: "gcp" }];
  }, [accounts]);

  useEffect(() => {
    if (viewIndex >= views.length) {
      setViewIndex(0);
    }
  }, [viewIndex, views.length]);

  const activeViewIndex = Math.max(0, Math.min(viewIndex, views.length - 1));
  const current = views[activeViewIndex] ?? { kind: "gcp" as const };

  const refreshGcp = async (force = false) => {
    setGcpLoading(true);
    setGcpError(null);
    try {
      const next = await fetchGcpBilling(force);
      setGcp(next);
    } catch (err) {
      setGcpError(err instanceof Error ? err.message : "Failed to load GCP usage.");
    } finally {
      setGcpLoading(false);
    }
  };

  useEffect(() => {
    if (current.kind === "gcp" && !gcp && !gcpLoading) {
      void refreshGcp();
    }
  }, [current.kind, gcp, gcpLoading]);

  const onRefresh = () => {
    if (current.kind === "gcp") {
      void refreshGcp(true);
      return;
    }
    void refresh({ refreshStatus: true });
  };

  const selectView = (idx: number) => {
    setShowGcpDetails(false);
    setViewIndex(idx);
  };

  const title = current.kind === "account" ? USAGE_COPY.codexUsageTitle : USAGE_COPY.gcpTitle;
  const isGcpView = current.kind === "gcp";
  const refreshUsageLabel = isGcpView ? USAGE_COPY.refreshGcp : USAGE_COPY.refreshCodex;
  const gcpServices = gcp ? topServices(gcp) : [];
  const gcpExportEmpty = gcp?.fallback?.kind === "export_empty";

  return (
    <Panel
      title={title}
      inlineHeader
      actions={
        <div className="usage__actions">
          <div className="usage__nav" role="tablist" aria-label="Usage views">
            {views.map((view, idx) => {
              const isActive = idx === activeViewIndex;
              const viewLabel =
                view.kind === "account" ? `${USAGE_COPY.codexUsageTitle}: ${getAccountLabel(view.account)}` : USAGE_COPY.gcpTitle;

              return (
                <button
                  key={view.kind === "account" ? `account-${view.account.id}-${idx}` : "gcp"}
                  className={`usage__navSquare${isActive ? " usage__navSquare--active" : ""}`}
                  onClick={() => selectView(idx)}
                  role="tab"
                  aria-label={viewLabel}
                  aria-selected={isActive}
                  title={viewLabel}
                >
                  {getViewLetter(view)}
                </button>
              );
            })}
          </div>
          <button
            className="button button--ghost button--icon button--iconOnly"
            onClick={onRefresh}
            aria-label={refreshUsageLabel}
            title={refreshUsageLabel}
          >
            <RefreshIcon />
          </button>
        </div>
      }
    >
      {current.kind === "account" && loading && <div className="state">{USAGE_COPY.accountLoading}</div>}
      {current.kind === "account" && statusError && (
        <div className="state state--error">
          {USAGE_COPY.accountStatusErrorPrefix} {statusError}
        </div>
      )}
      {current.kind === "account" && !loading && !statusError && (
        <CodexAccountView
          account={current.account}
          sourceUsage={sourceUsage}
          sourceUsageError={sourceUsageError}
        />
      )}

      {current.kind === "gcp" && gcpLoading && <div className="state">{USAGE_COPY.gcpLoading}</div>}
      {current.kind === "gcp" && gcpError && (
        <div className="state state--error">
          {USAGE_COPY.gcpUnavailablePrefix} {gcpError}
        </div>
      )}
      {current.kind === "gcp" && !gcpLoading && gcp && (
        <div className="usage">
          <section className="usage__hero usage__hero--gcp">
            <div className="usage__heroBg usage__heroBg--gcp" />
            {gcp.fallback && (
              <div className="state">
                {gcp.fallback.kind === "export_empty" ? USAGE_COPY.gcpExportEmptyState : gcp.fallback.note}
              </div>
            )}
            <div className="gcpUsage__totals">
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot"
                    ? "Today (Budget Snapshot)"
                    : gcpExportEmpty
                      ? "Today"
                      : "Today"}
                </div>
                <div className="gcpUsage__value">
                  {gcpExportEmpty ? "--" : formatCost(gcp.totals.today, gcp.currency)}
                </div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot"
                    ? "7D (Budget Snapshot)"
                    : gcpExportEmpty
                      ? "7D"
                      : "7D"}
                </div>
                <div className="gcpUsage__value">
                  {gcpExportEmpty ? "--" : formatCost(gcp.totals.last7d, gcp.currency)}
                </div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot"
                    ? "MTD (Budget Snapshot)"
                    : gcpExportEmpty
                      ? "MTD"
                      : "MTD"}
                </div>
                <div className="gcpUsage__value">
                  {gcpExportEmpty ? "--" : formatCost(gcp.totals.monthToDate, gcp.currency)}
                </div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">Net Cost</div>
                <div className="gcpUsage__value">
                  {gcpExportEmpty ? "--" : formatCost(gcp.netTotals.monthToDate, gcp.currency)}
                </div>
              </div>
            </div>
            <div className="gcpUsage__footer">
              <button className="button button--ghost usage__next" onClick={() => setShowGcpDetails((v) => !v)}>
                {showGcpDetails ? "Hide Details" : "Details"}
              </button>
            </div>
            {showGcpDetails && (
              <div className="gcpUsage__details">
                <div className="gcpUsage__sectionTitle">Service Costs</div>
                {gcpServices.length === 0 && <div className="gcpUsage__empty">{USAGE_COPY.gcpNoServiceCosts}</div>}
                {gcpServices.map((item) => (
                  <div className="gcpUsage__row" key={item.service}>
                    <div className="gcpUsage__service">{item.service}</div>
                    <div className="gcpUsage__cost">{formatCost(item.grossCost, gcp.currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {current.kind === "gcp" && !gcpLoading && !gcp && !gcpError && (
        <div className="state">{USAGE_COPY.gcpNoData}</div>
      )}
    </Panel>
  );
}
