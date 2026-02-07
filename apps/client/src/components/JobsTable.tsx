import "./JobsTable.css";

import type { ActiveJob } from "../types";

type Props = {
  jobs: ActiveJob[];
  selected?: string | null;
  onSelect: (messageId: string) => void;
};

const fmt = (ts?: string) => {
  if (!ts) return "-";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
};

export function JobsTable({ jobs, selected, onSelect }: Props) {
  if (jobs.length === 0) {
    return <div className="state">No active jobs detected.</div>;
  }

  return (
    <div className="jobs">
      <table className="jobs__table">
        <thead>
          <tr>
            <th>Message</th>
            <th>Started</th>
            <th>Elapsed</th>
            <th>PIDs</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr
              key={j.messageId}
              className={selected === j.messageId ? "jobs__row jobs__row--active" : "jobs__row"}
              onClick={() => onSelect(j.messageId)}
            >
              <td className="jobs__mono">{j.messageId}</td>
              <td className="jobs__mono">{fmt(j.startedAt)}</td>
              <td className="jobs__mono">{j.etime ?? "-"}</td>
              <td className="jobs__mono">{j.pids.join(", ")}</td>
              <td className="jobs__cmd">{j.cmd ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
