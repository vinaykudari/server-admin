import { useEffect, useMemo, useState } from "react";

import { useCodexUsage } from "../hooks/useCodexUsage";
import { fetchGcpBilling } from "../services/api";
import type { CodexAccountStatusPayload, CodexStatusLimit, GcpBillingPayload, GcpBillingServiceCost } from "../types";
import { Panel } from "./Panel";
import { RefreshIcon } from "./RefreshIcon";

import "./CodexUsagePanel.css";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const pct = (n: number | null) => (typeof n === "number" && Number.isFinite(n) ? clamp(n, 0, 100) : null);

const resetIn = (value: string | null | undefined) => {
  if (!value) return "Unknown";
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return "Unknown";

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

  return (
    <div className="usage">
      <section className="usage__hero">
        <div className="usage__heroBg" />
        <div className="usage__meta">
          <div className="usage__metaLabel">{account.label}</div>
          <div className="usage__metaValue">{account.id}</div>
          <div className="usage__metaSub">
            Auth: {account.hasAuth === null ? "Unknown" : account.hasAuth ? "Configured" : "Missing"}
          </div>
        </div>

        {!status && <div className="state">No status data available yet for this account.</div>}

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

  const current = views[Math.max(0, Math.min(viewIndex, views.length - 1))] ?? { kind: "gcp" as const };

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

  const next = () => {
    setShowGcpDetails(false);
    setViewIndex((idx) => {
      if (views.length === 0) return 0;
      return (idx + 1) % views.length;
    });
  };

  const title =
    current.kind === "account"
      ? `${current.account.label} Usage`
      : "GCP Usage";

  return (
    <Panel
      title={title}
      inlineHeader
      actions={
        <div className="usage__actions">
          <button className="button button--ghost usage__next" onClick={next}>
            Next
          </button>
          <button
            className="button button--ghost button--icon button--iconOnly"
            onClick={onRefresh}
            aria-label={current.kind === "gcp" ? "Refresh GCP usage live" : "Refresh Codex usage live"}
            title={current.kind === "gcp" ? "Refresh GCP usage live" : "Refresh Codex usage live"}
          >
            <RefreshIcon />
          </button>
        </div>
      }
    >
      {current.kind === "account" && loading && <div className="state">Loading usage...</div>}
      {current.kind === "account" && statusError && (
        <div className="state state--error">Plan status unavailable: {statusError}</div>
      )}
      {current.kind === "account" && !loading && !statusError && <CodexAccountView account={current.account} />}

      {current.kind === "gcp" && gcpLoading && <div className="state">Loading GCP usage...</div>}
      {current.kind === "gcp" && gcpError && <div className="state state--error">GCP usage unavailable: {gcpError}</div>}
      {current.kind === "gcp" && !gcpLoading && gcp && (
        <div className="usage">
          <section className="usage__hero usage__hero--gcp">
            <div className="usage__heroBg usage__heroBg--gcp" />
            <div className="gcpUsage__totals">
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">Today</div>
                <div className="gcpUsage__value">{formatCost(gcp.totals.today, gcp.currency)}</div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">7D</div>
                <div className="gcpUsage__value">{formatCost(gcp.totals.last7d, gcp.currency)}</div>
              </div>
              <div className="gcpUsage__tile">
                <div className="gcpUsage__label">MTD</div>
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
                {topServices(gcp).length === 0 && <div className="gcpUsage__empty">No service costs yet.</div>}
                {topServices(gcp).map((item) => (
                  <div className="gcpUsage__row" key={item.service}>
                    <div className="gcpUsage__service">{item.service}</div>
                    <div className="gcpUsage__cost">{formatCost(item.cost, gcp.currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {current.kind === "gcp" && !gcpLoading && !gcp && !gcpError && (
        <div className="state">No GCP usage data available yet.</div>
      )}
    </Panel>
  );
}
