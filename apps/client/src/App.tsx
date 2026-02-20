import "./App.css";

import { useState } from "react";

import { Panel } from "./components/Panel";
import { Tabs } from "./components/Tabs";
import { JobsTable } from "./components/JobsTable";
import { ActionsFeed } from "./components/ActionsFeed";
import { LogLines } from "./components/LogLines";
import { CodexLogViewer } from "./components/CodexLogViewer";
import { JobsPage } from "./components/JobsPage";
import { CodexUsagePanel } from "./components/CodexUsagePanel";
import { ConfigPage } from "./components/ConfigPage";
import { AgentLogsPage } from "./components/AgentLogsPage";
import { RefreshIcon } from "./components/RefreshIcon";
import { RunbookRecent } from "./components/RunbookRecent";
import { useLogs } from "./hooks/useLogs";
import { useActiveJobs } from "./hooks/useActiveJobs";
import { useActionsStream } from "./hooks/useActionsStream";
import { useGatewayLog } from "./hooks/useGatewayLog";
import { useJobOutput } from "./hooks/useJobOutput";
import { useRecentJobs } from "./hooks/useRecentJobs";

type TabId = "overview" | "jobs" | "live" | "agents" | "config";
const TAB_STORAGE_KEY = "server-admin.active-tab";

const isTabId = (value: string | null): value is TabId =>
  value === "overview" || value === "jobs" || value === "live" || value === "agents" || value === "config";

const getInitialTab = (): TabId => {
  if (typeof window === "undefined") return "overview";
  try {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
    return isTabId(saved) ? saved : "overview";
  } catch {
    return "overview";
  }
};

function App() {
  const [tab, setTab] = useState<TabId>(getInitialTab);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const { data, loading, error, refresh } = useLogs();

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
    lines: jobLines,
    error: jobError,
    paused: jobPaused,
    setPaused: setJobPaused,
    reload: reloadJobOutput,
  } = useJobOutput(selectedJob);

  const setActiveTab = (nextTab: TabId) => {
    setTab(nextTab);
    if (nextTab !== "live") {
      setSelectedJob(null);
    }
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, nextTab);
    } catch {
      // Ignore storage write issues and keep app state in memory.
    }
  };

  const openJobInLive = (messageId: string) => {
    setSelectedJob(messageId);
    setActiveTab("live");
  };

  return (
    <div className="app">
      <div className="app__glow" />
      <header className="app__header">
        <div className="app__headerRight">
          <Tabs active={tab} onChange={(id) => setActiveTab(id)} />
          <button
            className="button button--icon button--iconOnly"
            onClick={() => void refresh()}
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      {loading && <div className="state">Loading runbook data...</div>}
      {error && <div className="state state--error">{error}</div>}

      {tab === "overview" && !loading && data && (
        <div className="grid">
          <CodexUsagePanel />
          <Panel title="Runbook" actions={<span className="pill">Recent</span>}>
            <RunbookRecent doc={data.runbook} />
          </Panel>
        </div>
      )}

      {tab === "jobs" && (
        <JobsPage jobs={recent.jobs} loading={recent.loading} error={recent.error} onOpenJob={openJobInLive} />
      )}

      {tab === "live" && (
        <div className="grid grid--single">
          <Panel title="Active Jobs" actions={<span className="pill">Live</span>}>
            {warning && <div className="state">Warning: {warning}</div>}
            {jobsError && <div className="state state--error">{jobsError}</div>}
            <JobsTable jobs={jobs} selected={selectedJob} onSelect={(id) => setSelectedJob(id)} />
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
            {!selectedJob && <div className="state">Select a job.</div>}
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

      {tab === "config" && <ConfigPage />}
      {tab === "agents" && <AgentLogsPage />}
    </div>
  );
}

export default App;
