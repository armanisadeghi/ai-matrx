"use client";

import { useCallback } from "react";

import { useAuditStore } from "./useAuditStore";

/** Wires audit-store rebuild + dataset re-fetch for CanonicalizationToolbar. */
export function useCanonicalizationDatasetToolbar(
  reload: () => void | Promise<void>,
) {
  const { lastRefreshedAt, refreshing, rebuildAuditStore } = useAuditStore();

  const onRefreshAudit = useCallback(async () => {
    const ok = await rebuildAuditStore();
    if (ok) await reload();
  }, [rebuildAuditStore, reload]);

  return {
    lastRefreshedAt,
    refreshingAudit: refreshing,
    onRefreshAudit,
  };
}
