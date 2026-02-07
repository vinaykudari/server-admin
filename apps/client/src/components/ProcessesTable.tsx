import "./ProcessesTable.css";

import type { ActiveProcess } from "../types";

type Props = {
  processes: ActiveProcess[];
};

export function ProcessesTable({ processes }: Props) {
  if (processes.length === 0) {
    return <div className="state">No active Codex processes detected.</div>;
  }

  return (
    <div className="procs">
      <table className="procs__table">
        <thead>
          <tr>
            <th>PID</th>
            <th>Elapsed</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => (
            <tr key={p.pid}>
              <td className="procs__mono">{p.pid}</td>
              <td className="procs__mono">{p.etime}</td>
              <td className="procs__cmd">{p.cmd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
