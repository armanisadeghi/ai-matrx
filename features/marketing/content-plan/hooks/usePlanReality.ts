"use client";

/**
 * features/marketing/content-plan/hooks/usePlanReality.ts
 *
 * Plan-vs-reality: aidream's crawl reconciler
 * (POST /content-plan/sites/{id}/reconcile) held in the query cache so the
 * header trigger, the drift bar/sheet and the workbench read ONE state.
 * The server diffs `plan.node.route` against `web.page.path` (crawl data);
 * the client renders the report — matched (planned AND live), ghosts
 * (planned, nothing live), orphans (live URLs the plan doesn't know).
 *
 * AUTO, READ-ONLY, CACHED: the report loads with the workspace
 * (`write_edges: false` — a pure diff, no server-side writes), so drift is
 * visible without a human pressing anything. "On view with caching" beats a
 * schedule here: the compare is only meaningful while someone is looking at
 * the plan, and a 5-minute staleTime keeps the aidream call off the hot path.
 * The WRITE run — persisting the `realizes` alignment edges — stays on
 * explicit intent via `sync()`.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiPost, buildPath } from "@/lib/api/typed-client";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";

import { planKeys } from "../data/hooks";

export type RealityReport = components["schemas"]["ReconcileReport"];
export type RealityMatch = components["schemas"]["ReconcileMatch"];

async function runReconcile(
  siteId: string,
  writeEdges: boolean,
): Promise<RealityReport> {
  const { data } = await apiPost(
    buildPath("/content-plan/sites/{site_id}/reconcile", { site_id: siteId }),
    { write_edges: writeEdges },
  );
  return data;
}

export function usePlanReality(siteId: string | null) {
  const queryClient = useQueryClient();
  const key = planKeys.reality(siteId ?? "none");

  const query = useQuery<RealityReport>({
    queryKey: key,
    enabled: Boolean(siteId),
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: () => runReconcile(siteId as string, false),
  });

  return {
    report: query.data ?? null,
    /** First load only — a background re-check never blanks the badges. */
    isLoading: query.isLoading,
    /** Any fetch in flight (first load OR background re-check). */
    isRunning: query.isFetching,
    error: query.error,
    /** Manual re-check (read-only, same cache entry). */
    run: async () => {
      if (!siteId) return;
      const result = await query.refetch();
      if (result.error) {
        toast.error(
          `Reality check failed: ${extractErrorMessage(result.error)}`,
        );
      }
    },
    /** The WRITE run: re-reconcile AND persist the `realizes` alignment
     * edges server-side. Explicit intent only — never fired on mount. */
    sync: async () => {
      if (!siteId) return;
      try {
        const report = await runReconcile(siteId, true);
        queryClient.setQueryData(key, report);
        toast.success("Alignment saved — plan↔live links are up to date.");
      } catch (error) {
        toast.error(`Sync failed: ${extractErrorMessage(error)}`);
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
