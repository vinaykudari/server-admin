import "./LogViewer.css";

import type { LogDocument } from "../types";

const formatDate = (value: string) => new Date(value).toLocaleString();

type LogViewerProps = {
  doc: LogDocument;
};

export const LogViewer = ({ doc }: LogViewerProps) => (
  <div className="log-viewer">
    <div className="log-viewer__meta">
      <span className="log-viewer__path">{doc.path}</span>
      <span className="log-viewer__time">Updated {formatDate(doc.updatedAt)}</span>
    </div>
    <pre className="log-viewer__content">{doc.content}</pre>
  </div>
);
