import { useCallback, useEffect, useState } from "react";

import "./AppsPage.css";

import {
  disableManagedAppBoot,
  enableManagedAppBoot,
  fetchManagedApps,
  startManagedApp,
  stopManagedApp,
} from "../services/api";
import type { ManagedApp } from "../types";
import { Panel } from "./Panel";

type SaveState = {
  kind: "idle" | "working" | "ok" | "error";
  message?: string;
};

function statusClass(ok: boolean): string {
  return ok ? "appsBadge appsBadge--ok" : "appsBadge appsBadge--off";
}

export function AppsPage() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await fetchManagedApps();
      setApps(payload.apps);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load managed apps";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateOne = (next: ManagedApp) => {
    setApps((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)));
  };

  const runAction = async (app: ManagedApp, action: "start" | "stop" | "boot-enable" | "boot-disable") => {
    const actionLabel = `${app.name}: ${action}`;
    setBusyKey(`${app.id}:${action}`);
    setSaveState({ kind: "working", message: `${actionLabel}...` });
    try {
      let updated: ManagedApp;
      if (action === "start") {
        updated = await startManagedApp(app.id);
      } else if (action === "stop") {
        updated = await stopManagedApp(app.id);
      } else if (action === "boot-enable") {
        updated = await enableManagedAppBoot(app.id);
      } else {
        updated = await disableManagedAppBoot(app.id);
      }
      updateOne(updated);
      setSaveState({ kind: "ok", message: `${app.name} updated.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to run ${actionLabel}`;
      setSaveState({ kind: "error", message });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="grid grid--single">
      {loading && <div className="state">Loading managed apps...</div>}
      {loadError && <div className="state state--error">{loadError}</div>}
      {saveState.kind !== "idle" && (
        <div className={`state ${saveState.kind === "error" ? "state--error" : ""}`}>{saveState.message}</div>
      )}

      <Panel title="App Controls" actions={<span className="pill">Runtime + Boot</span>}>
        <div className="appsActions">
          <button className="button button--ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="appsTableWrap">
          <table className="appsTable">
            <thead>
              <tr>
                <th>App</th>
                <th>Type</th>
                <th>Runtime</th>
                <th>On Boot</th>
                <th>Memory</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const isWorking = busyKey?.startsWith(`${app.id}:`) ?? false;
                return (
                  <tr key={app.id}>
                    <td>
                      <div className="appsName">{app.name}</div>
                      <div className="appsTarget">{app.target}</div>
                    </td>
                    <td>
                      <code>{app.kind}</code>
                    </td>
                    <td>
                      <span className={statusClass(app.running)}>{app.running ? "running" : "stopped"}</span>
                      <div className="appsDetail">{app.statusDetail}</div>
                    </td>
                    <td>
                      <span className={statusClass(app.onBoot)}>{app.onBoot ? "enabled" : "disabled"}</span>
                      <div className="appsDetail">{app.bootDetail}</div>
                    </td>
                    <td>
                      <code>{app.memoryLabel}</code>
                    </td>
                    <td>
                      <div className="appsButtons">
                        <button
                          className="button button--ghost button--small"
                          type="button"
                          disabled={isWorking || !app.available || app.running}
                          onClick={() => void runAction(app, "start")}
                        >
                          Start
                        </button>
                        <button
                          className="button button--ghost button--small"
                          type="button"
                          disabled={isWorking || !app.available || !app.running}
                          onClick={() => void runAction(app, "stop")}
                        >
                          Stop
                        </button>
                        <button
                          className="button button--ghost button--small"
                          type="button"
                          disabled={isWorking || !app.available || app.onBoot}
                          onClick={() => void runAction(app, "boot-enable")}
                        >
                          Enable Boot
                        </button>
                        <button
                          className="button button--ghost button--small"
                          type="button"
                          disabled={isWorking || !app.available || !app.onBoot}
                          onClick={() => void runAction(app, "boot-disable")}
                        >
                          Disable Boot
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {apps.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="appsEmpty">
                    No managed apps configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
