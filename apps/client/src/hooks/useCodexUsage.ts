import { useCallback, useEffect, useState } from "react";

import { fetchCodexAccounts, fetchCodexSourceUsage } from "../services/api";
import type { CodexAccountsPayload, CodexSourceUsagePayload } from "../types";

type State = {
  accounts: CodexAccountsPayload | null;
  sourceUsage: CodexSourceUsagePayload | null;
  loading: boolean;
  statusError: string | null;
  sourceUsageError: string | null;
  refresh: (opts?: { refreshStatus?: boolean; silent?: boolean }) => Promise<void>;
};

export function useCodexUsage(): State {
  const [accounts, setAccounts] = useState<CodexAccountsPayload | null>(null);
  const [sourceUsage, setSourceUsage] = useState<CodexSourceUsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sourceUsageError, setSourceUsageError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { refreshStatus?: boolean; silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    const [accountsResult, sourceUsageResult] = await Promise.allSettled([
      fetchCodexAccounts(opts?.refreshStatus ?? false),
      fetchCodexSourceUsage(opts?.refreshStatus ?? false),
    ]);

    if (accountsResult.status === "fulfilled") {
      setAccounts(accountsResult.value);
      setStatusError(null);
    } else {
      const err = accountsResult.reason;
      setStatusError(err instanceof Error ? err.message : "Unknown error");
    }

    if (sourceUsageResult.status === "fulfilled") {
      setSourceUsage(sourceUsageResult.value);
      setSourceUsageError(null);
    } else {
      const err = sourceUsageResult.reason;
      setSourceUsageError(err instanceof Error ? err.message : "Unknown error");
    }

    if (!opts?.silent) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { accounts, sourceUsage, loading, statusError, sourceUsageError, refresh };
}
