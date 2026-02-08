import { useMemo } from "react";

import { useCodexStatus } from "../hooks/useCodexStatus";
import { Panel } from "./Panel";

import "./CodexStatusPanel.css";

export function CodexStatusPanel() {
  const { data, loading, error, refresh } = useCodexStatus();

  const fetchedAt = useMemo(() => {
    if (!data) return "-";
    return new Date().toLocaleString();
  }, [data]);

  return (
    <Panel
      title="Codex Limits"
      subtitle="From codex /status"
      actions={
        <button className="button button--ghost" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      }
    >
      {error && <div className="state state--error">{error}</div>}

      <div className="codexStatus__grid">
        <div className="codexStatus__metric">
          <div className="codexStatus__label">5h</div>
          <div className="codexStatus__value">
            {data?.fiveHour ? `${data.fiveHour.leftPercent}% left` : loading ? "Loading" : "-"}
          </div>
          <div className="codexStatus__hint">{data?.fiveHour?.resets ?? ""}</div>
        </div>

        <div className="codexStatus__metric">
          <div className="codexStatus__label">Weekly</div>
          <div className="codexStatus__value">
            {data?.weekly ? `${data.weekly.leftPercent}% left` : loading ? "Loading" : "-"}
          </div>
          <div className="codexStatus__hint">{data?.weekly?.resets ?? ""}</div>
        </div>

        <div className="codexStatus__metric">
          <div className="codexStatus__label">Model</div>
          <div className="codexStatus__value codexStatus__mono">{data?.model ?? (loading ? "Loading" : "-")}</div>
          <div className="codexStatus__hint" />
        </div>

        <div className="codexStatus__metric">
          <div className="codexStatus__label">Fetched</div>
          <div className="codexStatus__value codexStatus__mono">{fetchedAt}</div>
          <div className="codexStatus__hint" />
        </div>
      </div>

      {!loading && data && !data.fiveHour && !data.weekly && !error && (
        <div className="state">
          Could not read limits from /status output. Try Refresh again.
        </div>
      )}
    </Panel>
  );
}
