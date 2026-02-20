import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import "./ConfigPage.css";

import {
  createCredential,
  deleteCredential,
  deleteManagedEnv,
  fetchManagedCredentials,
  fetchManagedEnv,
  updateCredential,
  upsertManagedEnv,
} from "../services/api";
import type { CredentialEntry, ManagedCredentialsPayload, ManagedEnvPayload } from "../types";
import { Panel } from "./Panel";

type SaveState = {
  kind: "idle" | "saving" | "ok" | "error";
  message?: string;
};

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function ConfigPage() {
  const [envData, setEnvData] = useState<ManagedEnvPayload | null>(null);
  const [credentialData, setCredentialData] = useState<ManagedCredentialsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [credentialDomain, setCredentialDomain] = useState("");
  const [credentialUsername, setCredentialUsername] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [envPayload, credentialsPayload] = await Promise.all([fetchManagedEnv(), fetchManagedCredentials()]);
      setEnvData(envPayload);
      setCredentialData(credentialsPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load config data";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmitEnv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!envKey.trim()) {
      setSaveState({ kind: "error", message: "Env key is required." });
      return;
    }

    setSaveState({ kind: "saving", message: "Saving environment variable..." });
    try {
      await upsertManagedEnv(envKey.trim(), envValue);
      setEnvKey("");
      setEnvValue("");
      await load();
      setSaveState({ kind: "ok", message: "Environment variable saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save environment variable";
      setSaveState({ kind: "error", message });
    }
  };

  const onSubmitCredential = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!credentialDomain.trim() || !credentialUsername.trim() || !credentialPassword.trim()) {
      setSaveState({ kind: "error", message: "Domain, username, and password are required." });
      return;
    }

    setSaveState({ kind: "saving", message: "Saving credential..." });
    try {
      if (editingCredentialId) {
        await updateCredential(
          editingCredentialId,
          credentialDomain.trim(),
          credentialUsername.trim(),
          credentialPassword,
        );
      } else {
        await createCredential(credentialDomain.trim(), credentialUsername.trim(), credentialPassword);
      }

      setCredentialDomain("");
      setCredentialUsername("");
      setCredentialPassword("");
      setEditingCredentialId(null);
      await load();
      setSaveState({ kind: "ok", message: editingCredentialId ? "Credential updated." : "Credential added." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save credential";
      setSaveState({ kind: "error", message });
    }
  };

  const onDeleteEnv = async (key: string) => {
    if (!window.confirm(`Delete environment variable ${key}?`)) return;
    setSaveState({ kind: "saving", message: `Deleting ${key}...` });
    try {
      await deleteManagedEnv(key);
      await load();
      setSaveState({ kind: "ok", message: `${key} deleted.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete env variable";
      setSaveState({ kind: "error", message });
    }
  };

  const onDeleteCredential = async (entry: CredentialEntry) => {
    if (!window.confirm(`Delete credential for ${entry.domain} (${entry.username})?`)) return;
    setSaveState({ kind: "saving", message: `Deleting ${entry.domain}...` });
    try {
      await deleteCredential(entry.id);
      await load();
      setSaveState({ kind: "ok", message: `${entry.domain} deleted.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete credential";
      setSaveState({ kind: "error", message });
    }
  };

  const onEditCredential = (entry: CredentialEntry) => {
    setEditingCredentialId(entry.id);
    setCredentialDomain(entry.domain);
    setCredentialUsername(entry.username);
    setCredentialPassword(entry.password);
    setSaveState({ kind: "idle" });
  };

  const onCancelCredentialEdit = () => {
    setEditingCredentialId(null);
    setCredentialDomain("");
    setCredentialUsername("");
    setCredentialPassword("");
    setSaveState({ kind: "idle" });
  };

  const togglePassword = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="grid grid--single">
      {loading && <div className="state">Loading config store...</div>}
      {loadError && <div className="state state--error">{loadError}</div>}
      {saveState.kind !== "idle" && (
        <div className={`state ${saveState.kind === "error" ? "state--error" : ""}`}>{saveState.message}</div>
      )}

      <Panel title="Environment Variables">
        <form className="configForm configForm--env" onSubmit={(event) => void onSubmitEnv(event)}>
          <input
            className="configInput"
            type="text"
            placeholder="KEY_NAME"
            value={envKey}
            onChange={(event) => setEnvKey(event.target.value)}
          />
          <input
            className="configInput"
            type="text"
            placeholder="value"
            value={envValue}
            onChange={(event) => setEnvValue(event.target.value)}
          />
          <button className="button button--ghost" type="submit">
            Save
          </button>
        </form>

        <div className="configTableWrap">
          <table className="configTable">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(envData?.entries ?? []).map((entry) => (
                <tr key={entry.key}>
                  <td>
                    <code>{entry.key}</code>
                  </td>
                  <td>
                    <code>{entry.value || "(empty)"}</code>
                  </td>
                  <td>
                    <button className="button button--ghost button--small" onClick={() => void onDeleteEnv(entry.key)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {(envData?.entries.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="configEmpty">
                    No managed env variables yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Credential Store">
        <form className="configForm configForm--credential" onSubmit={(event) => void onSubmitCredential(event)}>
          <input
            className="configInput"
            type="text"
            placeholder="domain (example.com)"
            value={credentialDomain}
            onChange={(event) => setCredentialDomain(event.target.value)}
          />
          <input
            className="configInput"
            type="text"
            placeholder="username"
            value={credentialUsername}
            onChange={(event) => setCredentialUsername(event.target.value)}
          />
          <input
            className="configInput"
            type="password"
            placeholder="password"
            value={credentialPassword}
            onChange={(event) => setCredentialPassword(event.target.value)}
          />
          <div className="actionGroup">
            <button className="button button--ghost" type="submit">
              {editingCredentialId ? "Update" : "Add"}
            </button>
            {editingCredentialId && (
              <button className="button button--ghost" type="button" onClick={onCancelCredentialEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="configTableWrap">
          <table className="configTable">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Username</th>
                <th>Password</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(credentialData?.entries ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <code>{entry.domain}</code>
                  </td>
                  <td>
                    <code>{entry.username}</code>
                  </td>
                  <td>
                    <code>{revealedPasswords[entry.id] ? entry.password : "••••••••"}</code>
                  </td>
                  <td>{formatTimestamp(entry.updatedAt)}</td>
                  <td>
                    <div className="actionGroup">
                      <button
                        className="button button--ghost button--small"
                        type="button"
                        onClick={() => togglePassword(entry.id)}
                      >
                        {revealedPasswords[entry.id] ? "Hide" : "Show"}
                      </button>
                      <button
                        className="button button--ghost button--small"
                        type="button"
                        onClick={() => onEditCredential(entry)}
                      >
                        Edit
                      </button>
                      <button
                        className="button button--ghost button--small"
                        type="button"
                        onClick={() => void onDeleteCredential(entry)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(credentialData?.entries.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="configEmpty">
                    No credentials yet.
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
