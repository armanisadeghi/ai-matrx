/**
 * On-demand canonical GSC sync — the ONE compute call this feature makes.
 *
 * `POST /seo/sites/{site_id}/gsc/search-performance/sync` (aidream): builds
 * the collection from the site's live GSC binding, streams detached NDJSON,
 * and persists all six dimension profiles into
 * `seo.search_performance_daily`. Work never stops on disconnect.
 * (Distinct from the legacy scraper `sites/{id}/gsc/sync`, which feeds only
 * the page×date `web.gsc_page_stat` table.)
 */

import { callApi } from "@/lib/api/call-api";
import { parseStreamError } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";

export interface GscSyncCallbacks {
  signal?: AbortSignal;
  onEvent?: (event: TypedStreamEvent) => void;
}

export interface GscSyncResult {
  runId: string | null;
  /** Days actually persisted by this call (0 = a run that landed NOTHING). */
  createdObservations: number;
  /** Rows Google returned that we already had. Zero created + nonzero
   *  existing means "already up to date", NOT "the connection is broken". */
  existingObservations: number;
  /** The last day this sync covered, and whether that reached current data. */
  coveredThrough: string | null;
  daysBehind: number | null;
  reachedLatest: boolean;
  windowsRun: number;
  /** Echoed back so a caller can never mistake a history walk for a
   *  forward sync — the two mean opposite things by "covered through". */
  mode: "incremental" | "backfill";
}

export async function syncGscSearchPerformance(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string | null,
  options: { windowDays?: number; mode?: "incremental" | "backfill" } = {},
  callbacks: GscSyncCallbacks = {},
): Promise<GscSyncResult> {
  let runId: string | null = null;
  let streamError: Error | null = null;
  // The receipt carries the TRUTH about what landed. A sync that reports
  // "completed" while persisting nothing — or while stopping short of
  // today — is how five days of dead ingestion stayed invisible.
  let createdObservations = 0;
  let existingObservations = 0;
  let coveredThrough: string | null = null;
  let daysBehind: number | null = null;
  let reachedLatest = false;
  let windowsRun = 0;
  let mode: "incremental" | "backfill" = options.mode ?? "incremental";
  const response = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/gsc/search-performance/sync",
      method: "POST",
      pathParams: { site_id: siteId },
      // window_days omitted => the server's incremental watermark window.
      // `mode: "backfill"` walks BACKWARD from the oldest covered window
      // toward Google's ~16-month horizon. Forward sync can never produce
      // history, so "I only have two weeks of data" is not fixable by
      // pressing Sync — it needs this.
      body: {
        ...(options.windowDays ? { window_days: options.windowDays } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
      },
      ...(organizationId
        ? { scopeOverrides: { organization_id: organizationId } }
        : {}),
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        if (event.event === "data") {
          const data = event.data as { kind?: unknown; run_id?: unknown };
          if (data.kind === "seo.receipt") {
            if (typeof data.run_id === "string") runId = data.run_id;
            const receipt = (data as { receipt?: Record<string, unknown> })
              .receipt;
            if (receipt && typeof receipt === "object") {
              if (typeof receipt.created_observations === "number") {
                createdObservations = receipt.created_observations;
              }
              // `existing` is what separates "Google gave us nothing" from
              // "we already had every row" — without it, a second sync on an
              // up-to-date site looks identical to a broken connection.
              if (typeof receipt.existing_observations === "number") {
                existingObservations = receipt.existing_observations;
              }
              if (typeof receipt.covered_through === "string") {
                coveredThrough = receipt.covered_through;
              }
              if (typeof receipt.days_behind === "number") {
                daysBehind = receipt.days_behind;
              }
              reachedLatest = receipt.reached_latest === true;
              if (typeof receipt.windows_run === "number") {
                windowsRun = receipt.windows_run;
              }
              if (
                receipt.mode === "incremental" ||
                receipt.mode === "backfill"
              ) {
                mode = receipt.mode;
              }
            }
          }
        }
        if (event.event === "error") {
          streamError = parseStreamError(event.data);
        }
      },
    }),
  );
  if (response.error) {
    throw new Error(response.error.message);
  }
  if (streamError) {
    throw streamError;
  }
  return {
    runId,
    mode,
    existingObservations,
    createdObservations,
    coveredThrough,
    daysBehind,
    reachedLatest,
    windowsRun,
  };
}
