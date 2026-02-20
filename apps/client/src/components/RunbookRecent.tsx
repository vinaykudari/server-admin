import { useMemo, useState } from "react";

import type { LogDocument } from "../types";

import "./RunbookRecent.css";

type Props = {
  doc: LogDocument;
};

type RunbookEntry = {
  title: string;
  lines: string[];
};

const PAGE_SIZE = 4;

const parseRunbookEntries = (content: string): RunbookEntry[] => {
  const rows = content.split(/\r?\n/);
  const items: RunbookEntry[] = [];
  let current: RunbookEntry | null = null;

  for (const row of rows) {
    const heading = row.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) items.push(current);
      current = { title: heading[1].trim(), lines: [] };
      continue;
    }
    if (!current) continue;
    const clean = row.trim();
    if (!clean) continue;
    current.lines.push(clean);
  }
  if (current) items.push(current);
  return items.reverse();
};

const cleanLine = (line: string) => line.replace(/^[-*]\s+/, "").replace(/^`(.+)`$/, "$1");

export function RunbookRecent({ doc }: Props) {
  const entries = useMemo(() => parseRunbookEntries(doc.content), [doc.content]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const list = entries.slice(0, visible);
  const canLoadMore = visible < entries.length;

  return (
    <div className="runbookRecent">
      <div className="runbookRecent__meta">
        <span>{new Date(doc.updatedAt).toLocaleString()}</span>
        <span>{entries.length} entries</span>
      </div>

      {list.length === 0 && <div className="state">No runbook entries found.</div>}

      {list.map((entry, idx) => (
        <article className="runbookRecent__entry" key={`${entry.title}-${idx}`}>
          <h3 className="runbookRecent__title">{entry.title}</h3>
          <ul className="runbookRecent__list">
            {(entry.lines.length > 0 ? entry.lines : ["No notes"]).slice(0, 6).map((line, lineIdx) => (
              <li key={`${entry.title}-${lineIdx}`}>{cleanLine(line)}</li>
            ))}
          </ul>
        </article>
      ))}

      {canLoadMore && (
        <button className="button button--ghost runbookRecent__more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          Load More
        </button>
      )}
    </div>
  );
}
