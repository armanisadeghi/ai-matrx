/**
 * useAgentUsages — dispatch-on-idle hook for one agent's find-usages scan.
 * Every consumer (user window, admin window, report detail pane) reads through
 * this hook so no component fetches ad hoc.
 */

"use client";

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { fetchAgentUsages } from "@ai-matrx/chat/host/ui-slots";
import { makeSelectUsageCache, makeSelectUsageGroups, makeSelectUsageAggregates, makeSelectRedFlagSummary } from "@ai-matrx/chat/host/ui-slots";
import type { UsageScope } from "@ai-matrx/chat/ui/usages/usages.slice";
import { useMemo } from "react";

export function useAgentUsages(agentId: string | null, scope: UsageScope) {
  const dispatch = useAppDispatch();
  const id = agentId ?? "";

  const selectCache = useMemo(() => makeSelectUsageCache(scope, id), [scope, id]);
  const selectGroups = useMemo(() => makeSelectUsageGroups(scope, id), [scope, id]);
  const selectAggregates = useMemo(() => makeSelectUsageAggregates(scope, id), [scope, id]);
  const selectSummary = useMemo(() => makeSelectRedFlagSummary(scope, id), [scope, id]);

  const cache = useAppSelector(selectCache);
  const groups = useAppSelector(selectGroups);
  const aggregates = useAppSelector(selectAggregates);
  const summary = useAppSelector(selectSummary);

  useEffect(() => {
    if (!agentId) return;
    dispatch(fetchAgentUsages({ agentId, scope }));
  }, [dispatch, agentId, scope]);

  const refresh = useCallback(() => {
    if (agentId) dispatch(fetchAgentUsages({ agentId, scope, force: true }));
  }, [dispatch, agentId, scope]);

  return {
    status: cache?.status ?? "idle",
    error: cache?.error ?? null,
    groups,
    aggregates,
    summary,
    refresh,
  } as const;
}
