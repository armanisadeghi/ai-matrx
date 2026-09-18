// features/marketing/data/page-analysis-batch.ts
//
// "Analyze all pages" — the Pages surface's door to the half-price Batch lane.
//
// Submit: POST /seo/pages/analyze-batch. aidream picks the NEXT crawled pages of
// the site that still need analysis (in-flight pages and pages already analyzed
// for their current crawl are passed over), caps one submission at 200, and says
// whether more pages are waiting. Unchanged content is skipped server-side and
// costs nothing.
//
// State: batch.work_item rows read direct from Supabase under RLS (users read
// their organization's queue; only the server writes). Counts, never a spinner:
// batch results arrive in minutes to hours, so the surface shows where the work
// actually is.
//
// Doc: features/marketing/components/pages/FEATURE.md § Analyze all pages

import { callApi, type ApiCallError } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { BackendApiError } from "@/lib/api/errors";
import { createClient } from "@/utils/supabase/client";
import type { components } from "@/types/python-generated/api-types";

/** Generated from aidream's OpenAPI — never mirror it locally. */
export type PageAnalysisBatchSummary =
  components["schemas"]["BatchSubmitSummary"];

/** The matrx-batch purpose + result handler name for this lane. */
export const PAGE_ANALYSIS_PURPOSE = "seo.page_analysis";

function toBackendError(error: ApiCallError, requestId = ""): BackendApiError {
  return new BackendApiError({
    code: error.type,
    detail: error.message,
    userMessage: error.message,
    details: error.serverDetail ?? error.raw ?? null,
    requestId,
    status: error.status ?? null,
  });
}

export async function submitPageAnalysisBatch(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string,
): Promise<PageAnalysisBatchSummary> {
  const response = await dispatch(
    callApi({
      path: "/seo/pages/analyze-batch",
      method: "POST",
      // Empty page_ids = "the next pages of this site that still need analysis".
      body: { site_id: siteId, page_ids: [] },
      // The page's owning site is the entity-local authority for the org.
      scopeOverrides: { organization_id: organizationId },
      // 402 = the organization's daily background budget denied the batch; the
      // caller shows that message, it is not a platform fault.
      expectedErrorStatuses: [402],
    }),
  );
  if (response.error) throw toBackendError(response.error, response.requestId);
  if (!response.data) {
    throw new Error("The page analysis queue returned no summary.");
  }
  return response.data as PageAnalysisBatchSummary;
}

export interface PageAnalysisQueueState {
  /** Queued, claimed by the flusher, or submitted to the provider. */
  waiting: number;
  /** Provider answered; the result is being written onto the page. */
  delivering: number;
  /** Written onto the page. */
  analyzed: number;
  /** The provider or the result handler failed. */
  failed: number;
  /** When the newest item for this site was queued, if any. */
  lastQueuedAt: string | null;
}

function workItems() {
  return createClient().schema("batch").from("work_item");
}

export async function fetchPageAnalysisQueue(
  siteId: string,
  signal?: AbortSignal,
): Promise<PageAnalysisQueueState> {
  const scoped = <
    Q extends {
      eq: (column: "purpose", value: string) => Q;
      contains: (column: "handler_args", value: { site_id: string }) => Q;
      is: (column: "deleted_at", value: null) => Q;
    },
  >(
    query: Q,
  ): Q =>
    query
      .eq("purpose", PAGE_ANALYSIS_PURPOSE)
      .contains("handler_args", { site_id: siteId })
      .is("deleted_at", null);

  const count = { count: "exact" as const, head: true };
  const withSignal = <T extends { abortSignal: (s: AbortSignal) => T }>(q: T) =>
    signal ? q.abortSignal(signal) : q;

  const [waiting, delivering, analyzed, failed, newest] = await Promise.all([
    withSignal(
      scoped(workItems().select("id", count)).in("status", [
        "pending",
        "claimed",
        "submitted",
      ]),
    ),
    withSignal(
      scoped(workItems().select("id", count))
        .eq("status", "completed")
        .or("handler_status.is.null,handler_status.eq.dispatched"),
    ),
    withSignal(
      scoped(workItems().select("id", count))
        .eq("status", "completed")
        .eq("handler_status", "succeeded"),
    ),
    withSignal(
      scoped(workItems().select("id", count)).or(
        "status.in.(failed,dead_letter,abandoned),handler_status.in.(failed,dead)",
      ),
    ),
    withSignal(
      scoped(workItems().select("created_at"))
        .order("created_at", { ascending: false })
        .limit(1),
    ),
  ]);

  for (const result of [waiting, delivering, analyzed, failed, newest]) {
    if (result.error) throw result.error;
  }
  const newestRow = (newest.data ?? [])[0] as { created_at?: string } | undefined;

  return {
    waiting: waiting.count ?? 0,
    delivering: delivering.count ?? 0,
    analyzed: analyzed.count ?? 0,
    failed: failed.count ?? 0,
    lastQueuedAt: newestRow?.created_at ?? null,
  };
}
