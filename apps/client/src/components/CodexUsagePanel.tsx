import { useEffect, useMemo, useState } from "react";

import { useCodexUsage } from "../hooks/useCodexUsage";
import { fetchGcpBilling } from "../services/api";
import type { CodexAccountStatusPayload, CodexStatusLimit, GcpBillingPayload, GcpBillingServiceCost } from "../types";
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

const resetIn = (value: string | null | undefined) => {
  if (!value) return USAGE_COPY.unknown;
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return USAGE_COPY.unknown;

  const diffMs = target - Date.now();
  if (diffMs <= 0) return "now";

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes <= 0) return "<1m";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

const formatCost = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const formatMaybeCost = (value: number | null, currency = "USD") =>
  typeof value === "number" && Number.isFinite(value) ? formatCost(value, currency) : USAGE_COPY.unknown;

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return USAGE_COPY.unknown;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
};

const topServices = (data: GcpBillingPayload): GcpBillingServiceCost[] =>
  data.topServices.monthToDate.length > 0 ? data.topServices.monthToDate : data.topServices.last7d;

const StatusOrb = ({ title, limit, className }: { title: string; limit: CodexStatusLimit; className: string }) => {
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
          <div className="statusOrb__resetValue">in {resetIn(limit.resetsAt)}</div>
        </div>
      </div>
    </section>
  );
};

function CodexAccountView({ account }: { account: CodexAccountStatusPayload }) {
  const status = account.status;
  const accountLabel = getAccountLabel(account);

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
              <StatusOrb title="Weekly Limit" limit={status.limits.weekly} className="statusOrb--week" />
            </div>
            <div className="gcpUsage__totals gcpUsage__totals--codex">
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">24h Requests</div>
                <div className="gcpUsage__value">{account.usage24h.requests}</div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">24h Tokens</div>
                <div className="gcpUsage__value">{account.usage24h.totalTokens.toLocaleString()}</div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

type ViewItem = { kind: "account"; account: CodexAccountStatusPayload } | { kind: "gcp" };

export function CodexUsagePanel() {
  const { accounts, loading, statusError, refresh } = useCodexUsage();
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
  const gcpBudgetCurrency = gcp?.budgetEvents.payload.currencyCode ?? gcp?.currency ?? "USD";

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
      {current.kind === "account" && !loading && !statusError && <CodexAccountView account={current.account} />}

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
            {gcp.fallback?.kind === "budget_snapshot" && <div className="state">{gcp.fallback.note}</div>}
            <div className="gcpUsage__totals">
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot" ? "Today (Budget Snapshot)" : "Today (No Credits)"}
                </div>
                <div className="gcpUsage__value">{formatCost(gcp.totals.today, gcp.currency)}</div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot" ? "7D (Budget Snapshot)" : "7D (No Credits)"}
                </div>
                <div className="gcpUsage__value">{formatCost(gcp.totals.last7d, gcp.currency)}</div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">
                  {gcp.fallback?.kind === "budget_snapshot" ? "MTD (Budget Snapshot)" : "MTD (No Credits)"}
                </div>
                <div className="gcpUsage__value">{formatCost(gcp.totals.monthToDate, gcp.currency)}</div>
              </div>
            </div>
            <div className="gcpUsage__footer">
              <button className="button button--ghost usage__next" onClick={() => setShowGcpDetails((v) => !v)}>
                {showGcpDetails ? "Hide Details" : "Details"}
              </button>
            </div>
            {showGcpDetails && (
              <div className="gcpUsage__details">
                <div className="gcpUsage__sectionTitle">Service Costs (No Credits)</div>
                {gcpServices.length === 0 && <div className="gcpUsage__empty">{USAGE_COPY.gcpNoServiceCosts}</div>}
                {gcpServices.map((item) => (
                  <div className="gcpUsage__row" key={item.service}>
                    <div className="gcpUsage__service">{item.service}</div>
                    <div className="gcpUsage__cost">{formatCost(item.grossCost, gcp.currency)}</div>
                  </div>
                ))}
                <div className="gcpUsage__sectionTitle">Net After Credits</div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">Today</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.netTotals.today, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">7D</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.netTotals.last7d, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">MTD</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.netTotals.monthToDate, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__sectionTitle">Credit Adjustments</div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">Today</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.creditTotals.today, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">7D</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.creditTotals.last7d, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__row">
                  <div className="gcpUsage__service">MTD</div>
                  <div className="gcpUsage__cost">{formatCost(gcp.creditTotals.monthToDate, gcp.currency)}</div>
                </div>
                <div className="gcpUsage__sectionTitle">{USAGE_COPY.gcpBudgetEventsTitle}</div>
                {!gcp.budgetEvents.available && <div className="gcpUsage__empty">{USAGE_COPY.gcpNoBudgetEvents}</div>}
                {gcp.budgetEvents.available && (
                  <>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Budget</div>
                      <div className="gcpUsage__cost">{gcp.budgetEvents.payload.budgetDisplayName ?? USAGE_COPY.unknown}</div>
                    </div>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Cost Snapshot</div>
                      <div className="gcpUsage__cost">
                        {formatMaybeCost(gcp.budgetEvents.payload.costAmount, gcpBudgetCurrency)} /{" "}
                        {formatMaybeCost(gcp.budgetEvents.payload.budgetAmount, gcpBudgetCurrency)}
                      </div>
                    </div>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Threshold</div>
                      <div className="gcpUsage__cost">
                        {typeof gcp.budgetEvents.payload.alertThresholdExceeded === "number"
                          ? `${Math.round(gcp.budgetEvents.payload.alertThresholdExceeded * 100)}%`
                          : USAGE_COPY.unknown}
                      </div>
                    </div>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Interval Start</div>
                      <div className="gcpUsage__cost">{formatTimestamp(gcp.budgetEvents.payload.costIntervalStart)}</div>
                    </div>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Published</div>
                      <div className="gcpUsage__cost">{formatTimestamp(gcp.budgetEvents.lastPublishTime)}</div>
                    </div>
                    <div className="gcpUsage__row">
                      <div className="gcpUsage__service">Watcher Check</div>
                      <div className="gcpUsage__cost">{formatTimestamp(gcp.budgetEvents.lastCheckedAt)}</div>
                    </div>
                  </>
                )}
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
