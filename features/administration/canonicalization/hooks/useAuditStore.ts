"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

import {
  fetchLastAuditRefreshRunAt,
  refreshAuditStore,
} from "../utils/auditStoreClient";

/**
 * Audit store metadata + rebuild action. The audit.* tables are snapshots —
 * dropping a function in Postgres does not update broken-functions until
 * `audit.refresh()` runs.
 */
export function useAuditStore() {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reloadLastRefresh = useCallback(async () => {
    try {
      setLastRefreshedAt(await fetchLastAuditRefreshRunAt());
    } catch {
      // Non-fatal — toolbar still works without the timestamp.
    }
  }, []);

  useEffect(() => {
    void reloadLastRefresh();
  }, [reloadLastRefresh]);

  const rebuildAuditStore = useCallback(async () => {
    setRefreshing(true);
    try {
      const { note, durationMs } = await refreshAuditStore();
      toast.success(
        `Audit store rebuilt in ${(durationMs / 1000).toFixed(1)}s${note ? ` — ${note}` : ""}`,
      );
      await reloadLastRefresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [reloadLastRefresh]);

  return {
    lastRefreshedAt,
    refreshing,
    rebuildAuditStore,
    reloadLastRefresh,
  };
}
