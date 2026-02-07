import "./CodexLogViewer.css";

import { useMemo, useState } from "react";

type Props = {
  lines: string[];
};

type CodexItemKind = "reasoning" | "agent_message" | "command_execution" | "file_change";

type CodexCommandItem = {
  kind: "command";
  id: string;
  command?: string;
  output?: string;
  exitCode?: number | null;
  status?: string;
};

type CodexTextItem = {
  kind: "text";
  id: string;
  role: "agent" | "reasoning";
  text: string;
};

type CodexFileChangeItem = {
  kind: "file_change";
  id: string;
  status?: string;
  changes: { path: string; kind: string | undefined }[];
};

type CodexRawItem = {
  kind: "raw";
  id: string;
  text: string;
};

type TimelineItem = CodexCommandItem | CodexTextItem | CodexFileChangeItem | CodexRawItem;

const safeParseJson = (line: string): unknown | null => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

function buildTimeline(lines: string[]): TimelineItem[] {
  const itemsById = new Map<string, TimelineItem>();
  const order: string[] = [];
  let rawSeq = 0;

  const upsert = (item: TimelineItem) => {
    if (!itemsById.has(item.id)) {
      order.push(item.id);
    }
    itemsById.set(item.id, item);
  };

  for (const line of lines) {
    const parsed = safeParseJson(line);
    if (!parsed || typeof parsed !== "object") {
      rawSeq += 1;
      upsert({ kind: "raw", id: `raw_${rawSeq}`, text: line });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "";
    if (type !== "item.started" && type !== "item.completed") {
      continue;
    }

    const item = obj.item && typeof obj.item === "object" ? (obj.item as Record<string, unknown>) : null;
    if (!item) {
      continue;
    }

    const id = typeof item.id === "string" ? item.id : undefined;
    const itemType = typeof item.type === "string" ? (item.type as CodexItemKind) : undefined;

    if (!id || !itemType) {
      continue;
    }

    if (itemType === "agent_message" || itemType === "reasoning") {
      const text = typeof item.text === "string" ? item.text : "";
      upsert({
        kind: "text",
        id,
        role: itemType === "agent_message" ? "agent" : "reasoning",
        text,
      });
      continue;
    }

    if (itemType === "file_change") {
      const changesRaw = Array.isArray(item.changes) ? item.changes : [];
      const changes = changesRaw
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const cc = c as Record<string, unknown>;
          const p = typeof cc.path === "string" ? cc.path : "";
          if (!p) return null;
          const k = typeof cc.kind === "string" ? cc.kind : undefined;
          return { path: p, kind: k };
        })
        .filter((v): v is { path: string; kind: string | undefined } => v !== null);

      const status = typeof item.status === "string" ? item.status : undefined;
      upsert({ kind: "file_change", id, status, changes });
      continue;
    }

    if (itemType === "command_execution") {
      const prev = itemsById.get(id);
      const prevCmd = prev && prev.kind === "command" ? prev : null;
      const command = typeof item.command === "string" ? item.command : prevCmd?.command;
      const output = typeof item.aggregated_output === "string" ? item.aggregated_output : prevCmd?.output;
      const status = typeof item.status === "string" ? item.status : prevCmd?.status;
      const exitCode = typeof item.exit_code === "number" ? item.exit_code : prevCmd?.exitCode;
      upsert({ kind: "command", id, command, output, status, exitCode });
    }
  }

  return order.map((id) => itemsById.get(id)!).filter(Boolean);
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

function trimCommand(cmd?: string): string {
  if (!cmd) return "";
  // Commands are often long; keep them readable without losing the important prefix.
  return cmd.length > 240 ? `${cmd.slice(0, 240)}...` : cmd;
}

export function CodexLogViewer({ lines }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);

  const timeline = useMemo(() => buildTimeline(lines.slice(-1200)), [lines]);

  const filtered = useMemo(() => {
    if (showReasoning) return timeline;
    return timeline.filter((i) => !(i.kind === "text" && i.role === "reasoning"));
  }, [timeline, showReasoning]);

  if (lines.length === 0) {
    return <div className="state">No log lines yet.</div>;
  }

  return (
    <div className="codexlog">
      <div className="codexlog__toolbar">
        <button
          className={showReasoning ? "codexlog__toggle codexlog__toggle--on" : "codexlog__toggle"}
          onClick={() => setShowReasoning((v) => !v)}
          type="button"
          title="Show/hide model reasoning blocks"
        >
          {showReasoning ? "Reasoning: on" : "Reasoning: off"}
        </button>
        <span className="codexlog__hint">Parsed from Codex JSONL.</span>
      </div>

      <div className="codexlog__stream" role="log" aria-label="Codex job output">
        {filtered.map((entry) => {
          if (entry.kind === "raw") {
            return (
              <div key={entry.id} className="codexlog__card codexlog__card--raw">
                <pre className="codexlog__pre">{entry.text}</pre>
              </div>
            );
          }

          if (entry.kind === "text") {
            return (
              <div
                key={entry.id}
                className={
                  entry.role === "agent"
                    ? "codexlog__card codexlog__card--agent"
                    : "codexlog__card codexlog__card--reasoning"
                }
              >
                <div className="codexlog__meta">
                  <span className="codexlog__badge">{entry.role === "agent" ? "Agent" : "Reasoning"}</span>
                  <span className="codexlog__id">{entry.id}</span>
                </div>
                <pre className="codexlog__pre">{entry.text}</pre>
              </div>
            );
          }

          if (entry.kind === "file_change") {
            return (
              <div key={entry.id} className="codexlog__card codexlog__card--file">
                <div className="codexlog__meta">
                  <span className="codexlog__badge">File change</span>
                  {entry.status && <span className="codexlog__badge codexlog__badge--muted">{entry.status}</span>}
                  <span className="codexlog__id">{entry.id}</span>
                </div>
                {entry.changes.length === 0 ? (
                  <div className="codexlog__muted">(no paths reported)</div>
                ) : (
                  <ul className="codexlog__list">
                    {entry.changes.map((c) => (
                      <li key={c.path}>
                        <span className="codexlog__mono">{c.path}</span>
                        {c.kind && <span className="codexlog__kind">{c.kind}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }

          // command
          const exit = entry.exitCode;
          const isDone = typeof exit === "number";
          const ok = isDone ? exit === 0 : null;
          const out = entry.output ?? "";
          const outLines = countLines(out);
          const showDetails = out.length > 2000 || outLines > 40;

          return (
            <div key={entry.id} className="codexlog__card codexlog__card--cmd">
              <div className="codexlog__meta">
                <span className="codexlog__badge">Command</span>
                {isDone ? (
                  <span className={
                    ok ? "codexlog__badge codexlog__badge--ok" : "codexlog__badge codexlog__badge--err"
                  }>
                    exit {exit}
                  </span>
                ) : (
                  <span className="codexlog__badge codexlog__badge--muted">{entry.status ?? "running"}</span>
                )}
                <span className="codexlog__id">{entry.id}</span>
              </div>

              {entry.command && <pre className="codexlog__cmd">{trimCommand(entry.command)}</pre>}

              {out ? (
                showDetails ? (
                  <details className="codexlog__details">
                    <summary>
                      Output ({outLines.toLocaleString()} lines, {out.length.toLocaleString()} chars)
                    </summary>
                    <pre className="codexlog__pre">{out}</pre>
                  </details>
                ) : (
                  <pre className="codexlog__pre">{out}</pre>
                )
              ) : (
                <div className="codexlog__muted">(no output)</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
