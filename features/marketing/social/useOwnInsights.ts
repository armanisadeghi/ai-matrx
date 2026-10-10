"use client";

import { useQuery } from "@tanstack/react-query";

import { readOwnInsightDays, readOwnPostFigures, summarizeInsights, type InsightDay, type InsightSummary } from "./insights";

/**
 * Private insights for a set of tracked accounts: the shared hook behind the KPI "Own channel" table
 * and the account page. `days` is the trailing window the figures add up over.
 */
export function useOwnInsights(trackedAccountIds: readonly string[], days = 30) {
  const key = [...trackedAccountIds].sort().join(",");
  const query = useQuery({
    queryKey: ["marketing", "social", "insights", key],
    queryFn: () => readOwnInsightDays(trackedAccountIds),
    enabled: trackedAccountIds.length > 0,
    staleTime: 60_000,
  });
  const byAccount = new Map<string, InsightSummary>();
  const dayRows: InsightDay[] = query.data ?? [];
  for (const id of trackedAccountIds) byAccount.set(id, summarizeInsights(id, dayRows, days));
  return { ...query, summaries: byAccount, dayRows };
}

/** Per-post private figures for a set of tracked accounts (top posts on the account page and KPIs). */
export function useOwnPostFigures(trackedAccountIds: readonly string[]) {
  const key = [...trackedAccountIds].sort().join(",");
  return useQuery({
    queryKey: ["marketing", "social", "own-post-metrics", key],
    queryFn: () => readOwnPostFigures(trackedAccountIds),
    enabled: trackedAccountIds.length > 0,
    staleTime: 60_000,
  });
}
