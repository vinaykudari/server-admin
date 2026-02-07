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

type TurnState = {
  status: "running" | "completed" | "unknown";
  outputTokens?: number;
};

const safeParseJson = (line: string): unknown | null => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

function buildTimeline(lines: string[]): { timeline: TimelineItem[]; turn: TurnState } {
  const itemsById = new Map<string, TimelineItem>();
  const order: string[] = [];
  let rawSeq = 0;

  const turn: TurnState = { status: "unknown" };

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

    if (type === "turn.started") {
      turn.status = "running";
      continue;
    }

    if (type === "turn.completed") {
      turn.status = "completed";
      const usage = obj.usage && typeof obj.usage === "object" ? (obj.usage as Record<string, unknown>) : null;
      const out = usage && typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
      if (typeof out === "number") turn.outputTokens = out;
      continue;
    }

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
      const status = typeof item.status === "string" ? item.status : undefined;
      const rawChanges = Array.isArray(item.changes) ? item.changes : [];
      const changes = rawChanges
        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
        .filter(Boolean)
        .map((c) => ({
          path: typeof c?.path === "string" ? (c.path as string) : "(unknown)",
          kind: typeof c?.kind === "string" ? (c.kind as string) : undefined,
        }));

      upsert({ kind: "file_change", id, status, changes });
      continue;
    }

    // command_execution
    const command = typeof item.command === "string" ? item.command : undefined;
    const output = typeof item.aggregated_output === "string" ? item.aggregated_output : undefined;
    const exitCode = typeof item.exit_code === "number" ? item.exit_code : null;
    const status = typeof item.status === "string" ? item.status : undefined;

    upsert({ kind: "command", id, command, output, exitCode, status });
  }

  const timeline = order
    .map((id) => itemsById.get(id))
    .filter((x): x is TimelineItem => Boolean(x));

  return { timeline, turn };
}

const countLines = (text: string): number => {
  if (!text) return 0;
  return text.split("\n").length;
};

const trimCommand = (cmd: string): string => {
  if (!cmd) return "";
  return cmd.length > 360 ? `${cmd.slice(0, 360)}...` : cmd;
};

function statusLabel(turn: TurnState, items: TimelineItem[]): { label: string; tone: "ok" | "err" | "muted" } {
  const cmds = items.filter((i) => i.kind === "command") as CodexCommandItem[];
  const running = cmds.filter((c) => !c.exitCode && c.status && c.status !== "completed");
  const lastNonZero = [...cmds].reverse().find((c) => typeof c.exitCode === "number" && c.exitCode !== 0);

  if (running.length > 0) return { label: "running", tone: "muted" };
  if (turn.status === "completed") {
    if (lastNonZero) return { label: "completed (errors)", tone: "err" };
    return { label: "completed", tone: "ok" };
  }
  if (lastNonZero) return { label: "stopped (errors)", tone: "err" };
  return { label: "idle", tone: "muted" };
}

export function CodexLogViewer({ lines }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);

  const { timeline, turn } = useMemo(() => buildTimeline(lines), [lines]);

  const filtered = useMemo(() => {
    if (showReasoning) return timeline;
    return timeline.filter((i) => !(i.kind === "text" && i.role === "reasoning"));
  }, [timeline, showReasoning]);

  const summary = useMemo(() => {
    const cmds = filtered.filter((i) => i.kind === "command") as CodexCommandItem[];
    const inProgress = cmds.filter((c) => (c.status && c.status !== "completed") || c.exitCode === null);
    const current = [...inProgress].reverse().find((c) => c.command) ?? null;
    const lastExit = [...cmds].reverse().find((c) => typeof c.exitCode === "number") ?? null;
    const lastNonZero = [...cmds].reverse().find((c) => typeof c.exitCode === "number" && c.exitCode !== 0) ?? null;

    return { inProgressCount: inProgress.length, current, lastExit, lastNonZero };
  }, [filtered]);

  const st = statusLabel(turn, filtered);

  return (
    <div className="codexlog">
      <div className="codexlog__top">
        <div className="codexlog__controls">
          <button
            type="button"
            className="codexlog__toggle"
            onClick={() => setShowReasoning((v) => !v)}
          >
            Reasoning: {showReasoning ? "on" : "off"}
          </button>
        </div>
        <div className="codexlog__summary">
          <span
            className={
              st.tone === "ok"
                ? "codexlog__pill codexlog__pill--ok"
                : st.tone === "err"
                  ? "codexlog__pill codexlog__pill--err"
                  : "codexlog__pill"
            }
          >
            {st.label}
          </span>
          {summary.inProgressCount > 0 ? (
            <span className="codexlog__pill">in-progress: {summary.inProgressCount}</span>
          ) : null}
          {turn.outputTokens ? <span className="codexlog__pill">out: {turn.outputTokens.toLocaleString()} tok</span> : null}
        </div>
      </div>

      {summary.current?.command ? (
        <div className="codexlog__current">
          <div className="codexlog__currentTitle">Current step</div>
          <pre className="codexlog__cmd">{trimCommand(summary.current.command)}</pre>
        </div>
      ) : null}

      {summary.lastNonZero?.command ? (
        <div className="codexlog__current codexlog__current--err">
          <div className="codexlog__currentTitle">Latest error</div>
          <pre className="codexlog__cmd">{trimCommand(summary.lastNonZero.command)}</pre>
        </div>
      ) : null}

      <div className="codexlog__timeline">
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
                  <span className={ok ? "codexlog__badge codexlog__badge--ok" : "codexlog__badge codexlog__badge--err"}>
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
