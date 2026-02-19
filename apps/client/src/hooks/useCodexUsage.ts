import { useCallback, useEffect, useState } from "react";

import { fetchCodexAccounts } from "../services/api";
import type { CodexAccountsPayload } from "../types";

type State = {
  accounts: CodexAccountsPayload | null;
  loading: boolean;
  statusError: string | null;
  refresh: (opts?: { refreshStatus?: boolean }) => Promise<void>;
};

export function useCodexUsage(): State {
  const [accounts, setAccounts] = useState<CodexAccountsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { refreshStatus?: boolean }) => {
    setLoading(true);
    try {
      const res = await fetchCodexAccounts(opts?.refreshStatus ?? false);
      setAccounts(res);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { accounts, loading, statusError, refresh };
}
