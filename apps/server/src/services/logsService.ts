import fs from "node:fs/promises";

import { runbookPath, tasksPath } from "../utils/paths.js";

export type LogDocument = {
  name: "RUNBOOK" | "TASKS";
  path: string;
  content: string;
  updatedAt: string;
};

export type LogsPayload = {
  runbook: LogDocument;
  tasks: LogDocument;
};

const readDoc = async (name: LogDocument["name"], path: string): Promise<LogDocument> => {
  const stat = await fs.stat(path);
  const content = await fs.readFile(path, "utf-8");

  return {
    name,
    path,
    content,
    updatedAt: stat.mtime.toISOString()
  };
};

export const getLogs = async (): Promise<LogsPayload> => {
  const [runbook, tasks] = await Promise.all([
    readDoc("RUNBOOK", runbookPath),
    readDoc("TASKS", tasksPath)
  ]);

  return { runbook, tasks };
};
