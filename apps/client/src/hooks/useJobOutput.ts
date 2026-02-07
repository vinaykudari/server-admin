import { useEffect, useState } from "react";

import { fetchJobOutputRecent } from "../services/api";

type State = {
  connected: boolean;
  path: string | null;
  lines: string[];
  error: string | null;
  paused: boolean;
  setPaused: (v: boolean) => void;
};

const clamp = (arr: string[], max = 1200) => (arr.length > max ? arr.slice(arr.length - max) : arr);

export function useJobOutput(messageId: string | null): State {
  const [connected, setConnected] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const reset = () => {
      setConnected(false);
      setPath(null);
      setLines([]);
      setError(null);
    };

    if (!messageId) {
      reset();
      return () => {};
    }

    const start = async () => {
      try {
        const recent = await fetchJobOutputRecent(messageId, 200);
        if (!cancelled) {
          setPath(recent.path);
          setLines(clamp(recent.lines));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }

      es = new EventSource(`/api/jobs/${encodeURIComponent(messageId)}/output/stream`);

      es.addEventListener("ready", () => {
        setConnected(true);
      });

      es.addEventListener("path", (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { path: string };
          setPath(payload.path);
        } catch {
          // ignore
        }
      });

      es.addEventListener("log", (evt) => {
        if (paused) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { line: string };
          setLines((prev) => clamp([...prev, payload.line]));
        } catch {
          // ignore
        }
      });

      es.addEventListener("server_error", (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { message: string };
          setError(payload.message);
        } catch {
          setError("Server error");
        }
      });

      es.addEventListener("error", () => {
        setConnected(false);
      });
    };

    void start();

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [messageId, paused]);

  return { connected, path, lines, error, paused, setPaused };
}
