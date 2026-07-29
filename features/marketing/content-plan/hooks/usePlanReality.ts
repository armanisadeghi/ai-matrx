"use client";

/**
 * features/marketing/content-plan/hooks/usePlanReality.ts
 *
 * Plan-vs-reality: run aidream's crawl reconciler
 * (POST /content-plan/sites/{id}/reconcile) and hold its report in the query
 * cache so the header trigger and the workbench overlay read ONE state.
 * The server diffs `plan.node.route` against `web.page.path` (crawl data) and
 * writes `realizes` edges; the client only renders the report — matched
 * (planned AND live), ghosts (planned, nothing live), orphans (live URLs the
 * plan doesn't know). Manual-run only (enabled:false) — a reconcile writes
 * edges server-side, so it happens on intent, never on mount.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiPost, buildPath } from "@/lib/api/typed-client";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";

import { planKeys } from "../data/hooks";

export type RealityReport = components["schemas"]["ReconcileReport"];
export type RealityMatch = components["schemas"]["ReconcileMatch"];

export function usePlanReality(siteId: string | null) {
  const queryClient = useQueryClient();
  const key = planKeys.reality(siteId ?? "none");

  const query = useQuery<RealityReport>({
    queryKey: key,
    enabled: false,
    retry: 1,
    // The report is a snapshot of an explicit run — never background-refetch.
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await apiPost(
        buildPath("/content-plan/sites/{site_id}/reconcile", {
          site_id: siteId as string,
        }),
        { write_edges: true },
      );
      return data;
    },
  });

  return {
    report: query.data ?? null,
    isRunning: query.isFetching,
    error: query.error,
    run: async () => {
      if (!siteId) return;
      const result = await query.refetch();
      if (result.error) {
        toast.error(
          `Reality check failed: ${extractErrorMessage(result.error)}`,
        );
      }
    },
    dismiss: () => {
      queryClient.removeQueries({ queryKey: key, exact: true });
    },
  };
}

/** node_id → its live match, for O(1) badge lookups in tree rows. */
export function liveMatchesById(
  report: RealityReport | null,
): Map<string, RealityMatch> {
  const map = new Map<string, RealityMatch>();
  for (const match of report?.matched ?? []) {
    map.set(match.node_id, match);
  }
  return map;
}
