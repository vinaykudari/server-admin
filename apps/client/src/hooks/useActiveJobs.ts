import { useEffect, useState } from "react";

import { fetchActiveJobs } from "../services/api";
import type { ActiveJob } from "../types";

type State = {
  jobs: ActiveJob[];
  loading: boolean;
  error: string | null;
  warning: string | null;
};

export function useActiveJobs(pollMs = 4000): State {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchActiveJobs();
        if (cancelled) return;
        setJobs(res.jobs);
        setWarning(res.warning ?? null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
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

  return { jobs, loading, error, warning };
}
