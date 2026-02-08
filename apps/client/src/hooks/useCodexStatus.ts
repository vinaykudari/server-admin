import { useCallback, useEffect, useState } from "react";

import { fetchCodexStatus } from "../services/api";
import type { CodexStatusPayload } from "../types";

type State = {
  data: CodexStatusPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCodexStatus(): State {
  const [data, setData] = useState<CodexStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCodexStatus();
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
