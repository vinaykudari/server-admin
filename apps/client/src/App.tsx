import "./App.css";

import { useMemo, useState } from "react";

import { Panel } from "./components/Panel";
import { LogViewer } from "./components/LogViewer";
import { Tabs } from "./components/Tabs";
import { ProcessesTable } from "./components/ProcessesTable";
import { ActionsFeed } from "./components/ActionsFeed";
import { useLogs } from "./hooks/useLogs";
import { useActiveProcesses } from "./hooks/useActiveProcesses";
import { useActionsStream } from "./hooks/useActionsStream";
import type { LogDocument } from "./types";

type TabId = "overview" | "live";

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
  const [tab, setTab] = useState<TabId>("overview");

  const { data, loading, error, refresh } = useLogs();
  const tasksStats = countTasks(data?.tasks);

  const { processes, error: procError } = useActiveProcesses(5000);
  const { events, connected, error: streamError, paused, setPaused } = useActionsStream();

  const lastUpdate = useMemo(() => {
    if (!data) return "-";
    return new Date(data.runbook.updatedAt).toLocaleString();
  }, [data]);

  return (
    <div className="app">
      <div className="app__glow" />
      <header className="app__header">
        <div>
          <p className="app__kicker">Server Ops</p>
          <h1>Vinay System Console</h1>
          <p className="app__subtitle">Live operational memory from this VM.</p>
        </div>
        <div className="app__headerRight">
          <Tabs active={tab} onChange={setTab} />
          <button className="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="Open tasks" value={tasksStats.open.toString()} />
        <Stat label="Done tasks" value={tasksStats.done.toString()} />
        <Stat label="Last update" value={lastUpdate} />
      </section>

      {loading && <div className="state">Loading runbook data...</div>}
      {error && <div className="state state--error">{error}</div>}

      {tab === "overview" && !loading && data && (
        <div className="grid">
          <Panel title="Runbook" subtitle="Operational log" actions={<span className="pill">RUNBOOK.md</span>}>
            <LogViewer doc={data.runbook} />
          </Panel>
          <Panel title="Tasks" subtitle="Active + backlog" actions={<span className="pill">TASKS.md</span>}>
            <LogViewer doc={data.tasks} />
          </Panel>
        </div>
      )}

      {tab === "live" && (
        <div className="grid grid--single">
          <Panel
            title="Active Codex Jobs"
            subtitle="OpenClaw gateway container"
            actions={<span className="pill">docker ps</span>}
          >
            {procError && <div className="state state--error">{procError}</div>}
            <ProcessesTable processes={processes} />
          </Panel>

          <Panel
            title="Actions Stream"
            subtitle={connected ? "Live" : "Reconnecting"}
            actions={
              <button className="button button--ghost" onClick={() => setPaused(!paused)}>
                {paused ? "Resume" : "Pause"}
              </button>
            }
          >
            {streamError && <div className="state state--error">{streamError}</div>}
            <ActionsFeed events={events} />
          </Panel>
        </div>
      )}
    </div>
  );
}

export default App;
