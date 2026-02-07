import "./App.css";

import { Panel } from "./components/Panel";
import { LogViewer } from "./components/LogViewer";
import { useLogs } from "./hooks/useLogs";
import type { LogDocument } from "./types";

const countTasks = (doc?: LogDocument) => {
  if (!doc) return { open: 0, done: 0 };
  const open = doc.content.match(/^- \[ \]/gm)?.length ?? 0;
  const done = doc.content.match(/^- \[[xX]\]/gm)?.length ?? 0;
  return { open, done };
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="stat">
    <span className="stat__label">{label}</span>
    <span className="stat__value">{value}</span>
  </div>
);

function App() {
  const { data, loading, error, refresh } = useLogs();
  const tasksStats = countTasks(data?.tasks);

  return (
    <div className="app">
      <div className="app__glow" />
      <header className="app__header">
        <div>
          <p className="app__kicker">Server Ops</p>
          <h1>Vinay System Console</h1>
          <p className="app__subtitle">Live operational memory from this VM.</p>
        </div>
        <button className="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      <section className="stats">
        <Stat label="Open tasks" value={tasksStats.open.toString()} />
        <Stat label="Done tasks" value={tasksStats.done.toString()} />
        <Stat label="Last update" value={data ? new Date(data.runbook.updatedAt).toLocaleString() : "-"} />
      </section>

      {loading && <div className="state">Loading runbook data...</div>}
      {error && <div className="state state--error">{error}</div>}

      {!loading && data && (
        <div className="grid">
          <Panel
            title="Runbook"
            subtitle="Operational log"
            actions={<span className="pill">RUNBOOK.md</span>}
          >
            <LogViewer doc={data.runbook} />
          </Panel>
          <Panel
            title="Tasks"
            subtitle="Active + backlog"
            actions={<span className="pill">TASKS.md</span>}
          >
            <LogViewer doc={data.tasks} />
          </Panel>
        </div>
      )}
    </div>
  );
}

export default App;
