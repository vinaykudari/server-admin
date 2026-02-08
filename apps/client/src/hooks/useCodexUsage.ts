import { useCallback, useEffect, useState } from "react";

import { fetchCodexUsage } from "../services/api";
import type { CodexUsagePayload } from "../types";

type State = {
  data: CodexUsagePayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCodexUsage(): State {
  const [data, setData] = useState<CodexUsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCodexUsage();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
