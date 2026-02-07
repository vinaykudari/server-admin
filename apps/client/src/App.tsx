import "./App.css";

import { useMemo, useState } from "react";

import { Panel } from "./components/Panel";
import { LogViewer } from "./components/LogViewer";
import { Tabs } from "./components/Tabs";
import { JobsTable } from "./components/JobsTable";
import { ActionsFeed } from "./components/ActionsFeed";
import { LogLines } from "./components/LogLines";
import { CodexLogViewer } from "./components/CodexLogViewer";
import { JobsPage } from "./components/JobsPage";
import { useLogs } from "./hooks/useLogs";
import { useActiveJobs } from "./hooks/useActiveJobs";
import { useActionsStream } from "./hooks/useActionsStream";
import { useGatewayLog } from "./hooks/useGatewayLog";
import { useJobOutput } from "./hooks/useJobOutput";
import { useRecentJobs } from "./hooks/useRecentJobs";
import type { LogDocument } from "./types";

type TabId = "overview" | "jobs" | "live";

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
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const { data, loading, error, refresh } = useLogs();
  const tasksStats = countTasks(data?.tasks);

  const { jobs, warning, error: jobsError } = useActiveJobs(4000);
  const recent = useRecentJobs(6000, 80);

  const { events, connected, error: actionsError, paused, setPaused } = useActionsStream();
  const {
    connected: gwConnected,
    lines: gwLines,
    error: gwError,
    paused: gwPaused,
    setPaused: setGwPaused,
  } = useGatewayLog();

  const {
    connected: jobConnected,
    path: jobPath,
    lines: jobLines,
    error: jobError,
    paused: jobPaused,
    setPaused: setJobPaused,
    reload: reloadJobOutput,
  } = useJobOutput(selectedJob);

  const lastUpdate = useMemo(() => {
    if (!data) return "-";
    return new Date(data.runbook.updatedAt).toLocaleString();
  }, [data]);

  const openJobInLive = (messageId: string) => {
    setSelectedJob(messageId);
    setTab("live");
  };

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
          <Tabs
            active={tab}
            onChange={(id) => {
              setTab(id);
              if (id !== "live") setSelectedJob(null);
            }}
          />
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

      {tab === "jobs" && (
        <JobsPage jobs={recent.jobs} loading={recent.loading} error={recent.error} onOpenJob={openJobInLive} />
      )}

      {tab === "live" && (
        <div className="grid grid--single">
          <Panel title="Active Jobs" subtitle="Running Codex jobs" actions={<span className="pill">OPENCLAW</span>}>
            {warning && <div className="state">Warning: {warning}</div>}
            {jobsError && <div className="state state--error">{jobsError}</div>}
            <JobsTable jobs={jobs} selected={selectedJob} onSelect={(id) => setSelectedJob(id)} />
            <div className="state">
              Want a completed/failed job? Use the Jobs tab, then click a row to open it here.
            </div>
          </Panel>

          <Panel
            title={selectedJob ? `Job Output (message ${selectedJob})` : "Job Output"}
            subtitle={selectedJob ? (jobConnected ? "Live" : "Connecting") : "Select a job"}
            actions={
              selectedJob ? (
                <div className="actionRow">
                  <button className="button button--ghost" onClick={() => setJobPaused(!jobPaused)}>
                    {jobPaused ? "Resume" : "Pause"}
                  </button>
                  <button className="button button--ghost" onClick={() => reloadJobOutput(2000)}>
                    Load 2k
                  </button>
                  <button className="button button--ghost" onClick={() => reloadJobOutput(8000)}>
                    Load 8k
                  </button>
                </div>
              ) : (
                <span className="pill">CODEX</span>
              )
            }
          >
            {!selectedJob && <div className="state">Click an active job above to stream its Codex output.</div>}
            {selectedJob && jobPath && <div className="state">Log file: {jobPath}</div>}
            {selectedJob && jobError && <div className="state state--error">{jobError}</div>}
            {selectedJob && <CodexLogViewer lines={jobLines} />}
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
            {actionsError && <div className="state state--error">{actionsError}</div>}
            <ActionsFeed events={events} />
          </Panel>

          <Panel
            title="Gateway Log"
            subtitle={gwConnected ? "Live" : "Reconnecting"}
            actions={
              <button className="button button--ghost" onClick={() => setGwPaused(!gwPaused)}>
                {gwPaused ? "Resume" : "Pause"}
              </button>
            }
          >
            {gwError && <div className="state state--error">{gwError}</div>}
            <LogLines lines={gwLines} />
          </Panel>
        </div>
      )}
    </div>
  );
}

export default App;
