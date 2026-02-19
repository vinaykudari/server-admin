import { useEffect, useState } from "react";

import { useCodexUsage } from "../hooks/useCodexUsage";
import { fetchGcpBilling } from "../services/api";
import type {
  CodexAccountStatusPayload,
  CodexStatusLimit,
  GcpBillingPayload,
  GcpBillingServiceCost,
} from "../types";
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

type ViewMode = "codex1" | "codex2" | "gcp";

function nextView(view: ViewMode): ViewMode {
  if (view === "codex1") return "codex2";
  if (view === "codex2") return "gcp";
  return "codex1";
}

function titleForView(view: ViewMode) {
  if (view === "codex1") return "Codex 1 Usage";
  if (view === "codex2") return "Codex 2 Usage";
  return "GCP Usage";
}

function findAccount(accounts: CodexAccountStatusPayload[] | undefined, id: "codex1" | "codex2") {
  if (!accounts) return null;
  return accounts.find((a) => a.id === id) ?? null;
}

function CodexAccountView({ account, fallbackId }: { account: CodexAccountStatusPayload | null; fallbackId: string }) {
  const status = account?.status ?? null;

  return (
    <div className="usage">
      {!account && <div className="state">No account metadata found for `{fallbackId}`.</div>}
      {account && !status && <div className="state">No status data available yet for {account.label}.</div>}
      {account && (
        <section className="usage__hero">
          <div className="usage__heroBg" />
          <div className="usage__meta">
            <div className="usage__metaLabel">{account.label}</div>
            <div className="usage__metaValue">{account.id}</div>
            <div className="usage__metaSub">Auth: {account.hasAuth === null ? "Unknown" : account.hasAuth ? "Configured" : "Missing"}</div>
          </div>
          {status && (
            <div className="usage__orbs">
              <StatusOrb title="5-hour Limit" limit={status.limits.fiveHour} className="statusOrb--five" />
              <StatusOrb title="Weekly Limit" limit={status.limits.weekly} className="statusOrb--week" />
            </div>
          )}
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
        </section>
      )}
    </div>
  );
}

export function CodexUsagePanel() {
  const { accounts, loading, statusError, refresh } = useCodexUsage();
  const [view, setView] = useState<ViewMode>("codex1");
  const [gcp, setGcp] = useState<GcpBillingPayload | null>(null);
  const [gcpLoading, setGcpLoading] = useState(false);
  const [gcpError, setGcpError] = useState<string | null>(null);
  const [showGcpDetails, setShowGcpDetails] = useState(false);

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
    if (view === "gcp" && !gcp && !gcpLoading) {
      void refreshGcp();
    }
  }, [view, gcp, gcpLoading]);

  const onRefresh = () => {
    if (view === "gcp") {
      void refreshGcp(true);
      return;
    }
    void refresh({ refreshStatus: true });
  };

  const codex1 = findAccount(accounts?.accounts, "codex1");
  const codex2 = findAccount(accounts?.accounts, "codex2");

  return (
    <Panel
      title={titleForView(view)}
      inlineHeader
      actions={
        <div className="usage__actions">
          <button
            className="button button--ghost usage__next"
            onClick={() => {
              setShowGcpDetails(false);
              setView((curr) => nextView(curr));
            }}
          >
            Next
          </button>
          <button
            className="button button--ghost button--icon button--iconOnly"
            onClick={onRefresh}
            aria-label={view === "gcp" ? "Refresh GCP usage live" : "Refresh Codex usage live"}
            title={view === "gcp" ? "Refresh GCP usage live" : "Refresh Codex usage live"}
          >
            <RefreshIcon />
          </button>
        </div>
      }
    >
      {view !== "gcp" && loading && <div className="state">Loading usage...</div>}
      {view !== "gcp" && statusError && <div className="state state--error">Plan status unavailable: {statusError}</div>}
      {view === "codex1" && !loading && !statusError && <CodexAccountView account={codex1} fallbackId="codex1" />}
      {view === "codex2" && !loading && !statusError && <CodexAccountView account={codex2} fallbackId="codex2" />}

      {view === "gcp" && gcpLoading && <div className="state">Loading GCP usage...</div>}
      {view === "gcp" && gcpError && <div className="state state--error">GCP usage unavailable: {gcpError}</div>}
      {view === "gcp" && !gcpLoading && gcp && (
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
      {view === "gcp" && !gcpLoading && !gcp && !gcpError && <div className="state">No GCP usage data available yet.</div>}
    </Panel>
  );
}
