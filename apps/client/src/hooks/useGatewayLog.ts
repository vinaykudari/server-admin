import { useEffect, useState } from "react";

import { fetchGatewayLogRecent } from "../services/api";

type State = {
  connected: boolean;
  lines: string[];
  error: string | null;
  paused: boolean;
  setPaused: (v: boolean) => void;
};

const clamp = (arr: string[], max = 800) => (arr.length > max ? arr.slice(arr.length - max) : arr);

export function useGatewayLog(): State {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const recent = await fetchGatewayLogRecent(300);
        if (!cancelled) {
          setLines(clamp(recent.lines));
          if (recent.warning) setError(recent.warning);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }

      es = new EventSource("/api/jobs/gateway-log/stream");
      es.addEventListener("ready", () => {
        setConnected(true);
        setError(null);
      });
      es.addEventListener("error", () => {
        setConnected(false);
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
    };

    void start();

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [paused]);

  return { connected, lines, error, paused, setPaused };
}
