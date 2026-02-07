import "./RecentJobsTable.css";

import type { RecentJob } from "../types";

type Props = {
  jobs: RecentJob[];
  onOpen: (messageId: string) => void;
};

const fmt = (ts?: string) => {
  if (!ts) return "-";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
};

const fmtDur = (sec?: number) => {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "-";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
};

export function RecentJobsTable({ jobs, onOpen }: Props) {
  if (jobs.length === 0) {
    return <div className="state">No recent jobs yet.</div>;
  }

  return (
    <div className="recentjobs">
      <table className="recentjobs__table">
        <thead>
          <tr>
            <th>Message</th>
            <th>Status</th>
            <th>Started</th>
            <th>Ended</th>
            <th>Dur</th>
            <th>Exit</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.messageId} className="recentjobs__row" onClick={() => onOpen(j.messageId)}>
              <td className="recentjobs__mono">{j.messageId}</td>
              <td>
                <span className={`recentjobs__status recentjobs__status--${j.status}`}>{j.status}</span>
              </td>
              <td className="recentjobs__mono">{fmt(j.startedAt)}</td>
              <td className="recentjobs__mono">{fmt(j.endedAt)}</td>
              <td className="recentjobs__mono">{fmtDur(j.durationSec)}</td>
              <td className="recentjobs__mono">{typeof j.exitCode === "number" ? String(j.exitCode) : "-"}</td>
              <td className="recentjobs__mono">{j.actor ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
