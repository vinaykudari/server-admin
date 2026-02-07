import "./ActionsFeed.css";

import type { ActionEvent } from "../types";

const fmt = (ts?: string) => {
  if (!ts) return "-";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleString();
};

type Props = {
  events: ActionEvent[];
};

export function ActionsFeed({ events }: Props) {
  if (events.length === 0) {
    return <div className="state">No events yet.</div>;
  }

  const recent = events.slice(-200).reverse();

  return (
    <div className="feed">
      {recent.map((e, idx) => (
        <div key={`${e.ts ?? ""}-${idx}`} className={`feed__row feed__row--${e.event ?? "other"}`}>
          <div className="feed__meta">
            <span className="feed__ts">{fmt(e.ts)}</span>
            <span className="feed__pill">{e.source ?? "-"}</span>
            <span className="feed__pill">{e.actor ?? "-"}</span>
            <span className="feed__pill feed__pill--event">{e.event ?? "-"}</span>
          </div>
          {e.event === "start" && typeof e.args === "object" ? (
            <pre className="feed__detail">{JSON.stringify(e.args, null, 2)}</pre>
          ) : null}
          {e.event === "end" ? (
            <div className="feed__detail-inline">
              exit={String(e.exit_code ?? "-")}, duration={String(e.duration_sec ?? "-")}s
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
