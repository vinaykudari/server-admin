import path from "node:path";
import { fileURLToPath } from "node:url";

// OpenClaw runs natively on the VM under the openclaw OS user.
// Keep env override for future flexibility, but default to the native state dir.
export const workspaceRoot =
  process.env.WORKSPACE_ROOT ?? "/home/openclaw/.openclaw/workspace";
export const openclawStateRoot =
  process.env.OPENCLAW_STATE_ROOT ?? "/home/openclaw/.openclaw";
export const agentsRoot = path.join(openclawStateRoot, "agents");

export const runbookPath = path.join(workspaceRoot, "RUNBOOK.md");
export const tasksPath = path.join(workspaceRoot, "TASKS.md");
export const actionsLogPath = path.join(workspaceRoot, "logs", "actions.ndjson");
export const managedEnvPath =
  process.env.MANAGED_ENV_PATH ?? path.join(workspaceRoot, ".env.shared");
export const credentialStorePath =
  process.env.CREDENTIAL_STORE_PATH ??
  path.join(workspaceRoot, "credentials", "store.json");

export const codexLogsDir = path.join(workspaceRoot, "logs", "codex");

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const clientDistPath =
  process.env.CLIENT_DIST_PATH ?? path.resolve(currentDir, "../../client/dist");
