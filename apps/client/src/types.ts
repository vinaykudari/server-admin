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
