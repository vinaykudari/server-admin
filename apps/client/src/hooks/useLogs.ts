import { useCallback, useEffect, useState } from "react";

import { fetchLogs } from "../services/api";
import type { LogsPayload } from "../types";

export type LogsState = {
  data: LogsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useLogs = (): LogsState => {
  const [data, setData] = useState<LogsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchLogs();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
};
