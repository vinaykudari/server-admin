import "./LogLines.css";

type Props = {
  lines: string[];
};

export function LogLines({ lines }: Props) {
  if (lines.length === 0) {
    return <div className="state">No log lines yet.</div>;
  }

  return (
    <pre className="loglines">
      {lines.slice(-600).join("\n")}
    </pre>
  );
}
