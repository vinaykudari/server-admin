import { useCallback, useEffect, useState } from "react";

import type { AgentSessionSummary } from "../types";
import { fetchAgentLogs, fetchAgentSessionLog } from "../services/api";
import { Panel } from "./Panel";
import { RefreshIcon } from "./RefreshIcon";

import "./AgentLogsPage.css";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function AgentLogsPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [agent, setAgent] = useState<string>("");
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (agentId: string, sessionId: string) => {
    if (!agentId || !sessionId) {
      setLines([]);
      return;
    }
    const payload = await fetchAgentSessionLog(agentId, sessionId, 350);
    setLines(payload.lines);
  }, []);

  const loadAgent = useCallback(
    async (agentId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAgentLogs(agentId, 60);
        setAgents(payload.agents);
        const active = payload.agent ?? "";
        setAgent(active);
        setSessions(payload.sessions);
        const nextSession = payload.sessions[0]?.sessionId ?? "";
        setSelectedSession(nextSession);
        await loadSession(active, nextSession);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load agent logs";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [loadSession],
  );

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  const onSelectSession = async (sessionId: string) => {
    setSelectedSession(sessionId);
    setError(null);
    try {
      await loadSession(agent, sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load session";
      setError(message);
    }
  };

  const onChangeAgent = async (nextAgent: string) => {
    await loadAgent(nextAgent);
  };

  return (
    <div className="grid grid--single">
      <Panel
        title="Agent Logs"
        inlineHeader
        actions={
          <div className="agentLogs__controls">
            <select className="agentLogs__select" value={agent} onChange={(event) => void onChangeAgent(event.target.value)}>
              {agents.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              className="button button--ghost button--icon button--iconOnly"
              onClick={() => void loadAgent(agent)}
              aria-label="Refresh agent logs"
              title="Refresh agent logs"
            >
              <RefreshIcon />
            </button>
          </div>
        }
      >
        {loading && <div className="state">Loading agent logs...</div>}
        {error && <div className="state state--error">{error}</div>}

        {!loading && sessions.length === 0 && <div className="state">No session logs found.</div>}

        {!loading && sessions.length > 0 && (
          <div className="agentLogs">
            <div className="agentLogs__sessions">
              {sessions.map((session) => (
                <button
                  key={session.sessionId}
                  className={`agentLogs__session ${selectedSession === session.sessionId ? "agentLogs__session--active" : ""}`}
                  onClick={() => void onSelectSession(session.sessionId)}
                >
                  <span className="agentLogs__sessionId">{session.sessionId}</span>
                  <span className="agentLogs__sessionMeta">
                    {new Date(session.updatedAt).toLocaleString()} | {formatSize(session.sizeBytes)}
                    {session.hasLogFile === false ? " | metadata" : ""}
                  </span>
                </button>
              ))}
            </div>

            <div className="agentLogs__viewer" role="log" aria-live="polite">
              {lines.length === 0 && <div className="agentLogs__line">No lines in selected session.</div>}
              {lines.map((line, idx) => (
                <div key={`${selectedSession}-${idx}`} className="agentLogs__line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
