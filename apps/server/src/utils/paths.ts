import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.env.WORKSPACE_ROOT ?? "/root/.openclaw/workspace";

export const runbookPath = path.join(workspaceRoot, "RUNBOOK.md");
export const tasksPath = path.join(workspaceRoot, "TASKS.md");

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const clientDistPath =
  process.env.CLIENT_DIST_PATH ?? path.resolve(currentDir, "../../client/dist");
