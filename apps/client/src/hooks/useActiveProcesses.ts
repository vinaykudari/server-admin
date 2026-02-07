import { useEffect, useState } from "react";

import { fetchActiveSessions } from "../services/api";
import type { ActiveProcess } from "../types";

type ActiveProcessesState = {
  processes: ActiveProcess[];
  loading: boolean;
  error: string | null;
};

export function useActiveProcesses(pollMs = 5000): ActiveProcessesState {
  const [processes, setProcesses] = useState<ActiveProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchActiveSessions();
        if (!cancelled) {
          setProcesses(res.processes);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return { processes, loading, error };
}
