import { useEffect, useMemo, useRef, useState } from "react";

import { fetchRecentActions } from "../services/api";
import type { ActionEvent } from "../types";

type ActionsStreamState = {
  events: ActionEvent[];
  connected: boolean;
  error: string | null;
  paused: boolean;
  setPaused: (next: boolean) => void;
};

const clampEvents = (events: ActionEvent[], max = 500) =>
  events.length > max ? events.slice(events.length - max) : events;

export function useActionsStream(): ActionsStreamState {
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const source = useMemo(() => ({ url: "/api/stream/actions" }), []);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const recent = await fetchRecentActions(200);
        if (!cancelled) setEvents(clampEvents(recent.events));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }

      es = new EventSource(source.url);

      es.addEventListener("open", () => {
        setConnected(true);
        setError(null);
      });

      es.addEventListener("error", () => {
        setConnected(false);
      });

      es.addEventListener("action", (evt) => {
        if (pausedRef.current) return;
        try {
          const parsed = JSON.parse((evt as MessageEvent).data) as ActionEvent;
          setEvents((prev) => clampEvents([...prev, parsed]));
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("ping", () => {
        // keepalive
      });
    };

    void start();

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [source.url]);

  return { events, connected, error, paused, setPaused };
}
