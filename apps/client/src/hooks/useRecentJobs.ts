import { useEffect, useState } from "react";

import { fetchRecentJobs } from "../services/api";
import type { RecentJob } from "../types";

type State = {
  jobs: RecentJob[];
  loading: boolean;
  error: string | null;
};

export function useRecentJobs(pollMs = 6000, limit = 60): State {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchRecentJobs(limit);
        if (cancelled) return;
        setJobs(res.jobs);
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
  }, [pollMs, limit]);

  return { jobs, loading, error };
}
