import { useMemo } from "react";

import { useCodexUsage } from "../hooks/useCodexUsage";
import type { CodexUsageWindow } from "../types";
import { Panel } from "./Panel";

import "./CodexUsagePanel.css";

const fmt = (n: number) => n.toLocaleString();

const WindowBlock = ({ title, w }: { title: string; w: CodexUsageWindow }) => (
  <section className="usageBlock">
    <div className="usageBlock__title">{title}</div>
    <div className="usageBlock__grid">
      <div className="usageMetric">
        <div className="usageMetric__label">Runs</div>
        <div className="usageMetric__value">{fmt(w.runs)}</div>
      </div>
      <div className="usageMetric">
        <div className="usageMetric__label">Input</div>
        <div className="usageMetric__value">{fmt(w.inputTokens)}</div>
      </div>
      <div className="usageMetric">
        <div className="usageMetric__label">Cached</div>
        <div className="usageMetric__value">{fmt(w.cachedInputTokens)}</div>
      </div>
      <div className="usageMetric">
        <div className="usageMetric__label">Output</div>
        <div className="usageMetric__value">{fmt(w.outputTokens)}</div>
      </div>
      <div className="usageMetric">
        <div className="usageMetric__label">Total</div>
        <div className="usageMetric__value">{fmt(w.totalTokens)}</div>
      </div>
    </div>
    <div className="usageBlock__range">
      {new Date(w.since).toLocaleString()} to {new Date(w.until).toLocaleString()}
    </div>
  </section>
);

export function CodexUsagePanel() {
  const { data, loading, error, refresh } = useCodexUsage();

  const fetchedAt = useMemo(() => {
    if (!data) return null;
    return new Date().toLocaleString();
  }, [data]);

  return (
    <Panel
      title="Codex Usage"
      subtitle="VM totals (from Codex job logs)"
      actions={
        <button className="button button--ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      }
    >
      {loading && <div className="state">Loading usage...</div>}
      {error && <div className="state state--error">{error}</div>}
      {data?.warning && <div className="state">Warning: {data.warning}</div>}

      {!loading && data && (
        <div className="usage">
          <div className="usage__meta">
            <div>
              Scanned logs: <span className="usage__mono">{fmt(data.scannedFiles)}</span>
            </div>
            {data.newestLogAt && (
              <div>
                Newest log: <span className="usage__mono">{new Date(data.newestLogAt).toLocaleString()}</span>
              </div>
            )}
            {fetchedAt && (
              <div>
                Fetched: <span className="usage__mono">{fetchedAt}</span>
              </div>
            )}
          </div>

          <div className="usage__blocks">
            <WindowBlock title="Last 5 hours" w={data.last5h} />
            <WindowBlock title="Last 7 days" w={data.last7d} />
          </div>

          <div className="usage__note">
            Note: this reflects token usage recorded in Codex JSONL logs on this VM. It does not currently show your
            Codex plan's remaining credits/limits ("/status"), because that data isn't fetchable server-side from this
            VM.
          </div>
        </div>
      )}
    </Panel>
  );
}
