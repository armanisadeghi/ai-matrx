"use client";

// useDashboardMetrics — one round-trip for every engagement count on the
// dashboard (agents, conversations, knowledge files, published apps, …).
//
// Backed by the `get_user_dashboard_metrics` RPC (SECURITY DEFINER, scoped to
// auth.uid()). Wrapped in React Query so a remount / route bounce reuses the
// cached result instead of re-firing — the file-fetch-duplication trap that
// bites hot pages when click + router.push remounts the route.

import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { supabase } from "@/utils/supabase/client";
import { type DashboardMetrics, EMPTY_DASHBOARD_METRICS } from "../types";

function coerceMetrics(data: unknown): DashboardMetrics {
  if (typeof data !== "object" || data === null) return EMPTY_DASHBOARD_METRICS;
  const o = data as Record<string, unknown>;
  const n = (k: keyof DashboardMetrics): number =>
    typeof o[k] === "number" ? (o[k] as number) : 0;
  return {
    agents: n("agents"),
    conversations: n("conversations"),
    knowledge_files: n("knowledge_files"),
    published_apps: n("published_apps"),
    notes: n("notes"),
    tasks: n("tasks"),
    transcripts: n("transcripts"),
    scopes: n("scopes"),
    shortcuts: n("shortcuts"),
  };
}

export interface UseDashboardMetricsResult {
  metrics: DashboardMetrics;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useDashboardMetrics(): UseDashboardMetricsResult {
  const userId = useAppSelector(selectUserId);

  const query = useQuery({
    queryKey: ["dashboard-metrics", userId],
    enabled: Boolean(userId),
    staleTime: 60_000, // counts move slowly; don't re-hammer the RPC
    queryFn: async (): Promise<DashboardMetrics> => {
      const { data, error } = await supabase.rpc("get_user_dashboard_metrics");
      if (error) throw error;
      return coerceMetrics(data);
    },
  });

  return {
    metrics: query.data ?? EMPTY_DASHBOARD_METRICS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
