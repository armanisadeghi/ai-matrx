import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { callApi, type ApiCallError } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  parsePersistedBackendError,
  parseStreamError,
  BackendApiError,
} from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { components } from "@/types/python-generated/api-types";

/** Types generated from aidream's live OpenAPI — never mirror these locally. */
export type PagePerformanceResponse =
  components["schemas"]["PagePerformanceResponse"];
export type PagePerformanceSample =
  components["schemas"]["PagePerformanceSample"];
export type PagePerformanceRegression =
  components["schemas"]["PagePerformanceRegressionOut"];
export type GscDailyPoint = components["schemas"]["GscDailyPoint"];

function callApiError(error: ApiCallError, requestId = ""): BackendApiError {
  return new BackendApiError({
    code: error.type,
    detail: error.message,
    userMessage: error.message,
    details: error.serverDetail ?? error.raw ?? null,
    requestId,
    status: error.status ?? null,
  });
}

/**
 * Canonical combined per-page performance read. The Python service owns the
 * PSI history/regression verdict and joins it with the page's GSC window.
 */
export async function getPagePerformance(
  dispatch: AppDispatch,
  pageId: string,
  gscWindowDays = 28,
  signal?: AbortSignal,
): Promise<PagePerformanceResponse> {
  const response = await dispatch(
    callApi({
      path: "/seo/pages/{page_id}/performance",
      method: "GET",
      pathParams: { page_id: pageId },
      queryParams: { gsc_window_days: gscWindowDays },
      signal,
    }),
  );
  if (response.error) throw callApiError(response.error, response.requestId);
  if (!response.data) {
    throw new Error("The page performance service returned no data.");
  }
  return response.data as PagePerformanceResponse;
}

/** Durable last-failure read stays direct-to-Supabase under RLS. */
export async function getLatestPagespeedFailure(
  pageId: string,
  signal?: AbortSignal,
): Promise<BackendApiError | null> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("collection_run")
    .select("status, error, request_id")
    .eq("page_id", pageId)
    .eq("provider", "pagespeed_insights")
    .order("requested_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const latest = response.data[0];
  if (!latest || latest.status !== "failed") return null;
  return parsePersistedBackendError(latest.error, latest.request_id ?? "");
}

export type PagespeedStrategy = "mobile" | "desktop" | "both";

export interface PagespeedSyncProgress {
  stage: "provider" | "persisted" | "complete";
  strategy: Exclude<PagespeedStrategy, "both"> | null;
  runId: string | null;
  message: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function eventStrategy(
  data: Record<string, unknown>,
): Exclude<PagespeedStrategy, "both"> | null {
  const direct = data.strategy;
  if (direct === "mobile" || direct === "desktop") return direct;
  const settings = record(data.settings);
  const nested = settings?.strategy;
  return nested === "mobile" || nested === "desktop" ? nested : null;
}

/**
 * Turn provider-shaped SEO progress into three stable, human-readable stages.
 * Unknown events deliberately return null; the UI never pretends they are
 * milestones it understands.
 */
export function describePagespeedStreamEvent(
  event: TypedStreamEvent,
): PagespeedSyncProgress | null {
  if (event.event !== "data") return null;
  const data = record(event.data);
  if (!data || typeof data.kind !== "string") return null;
  const strategy = eventStrategy(data);
  const strategyLabel = strategy
    ? `${strategy[0].toUpperCase()}${strategy.slice(1)}`
    : "PageSpeed";
  const runId = typeof data.run_id === "string" ? data.run_id : null;

  if (data.kind === "seo.provider_request_started") {
    return {
      stage: "provider",
      strategy,
      runId,
      message: `${strategyLabel} test is running at Google…`,
    };
  }
  if (data.kind === "seo.observations_persisted") {
    return {
      stage: "persisted",
      strategy,
      runId,
      message: `${strategyLabel} results received and saved.`,
    };
  }
  if (data.kind === "seo.receipt") {
    return {
      stage: "complete",
      strategy,
      runId,
      message: `${strategyLabel} test complete.`,
    };
  }
  return null;
}

export interface PagespeedSyncCallbacks {
  signal?: AbortSignal;
  onEvent?: (event: TypedStreamEvent) => void;
  onProgress?: (progress: PagespeedSyncProgress) => void;
}

export interface PagespeedSyncResult {
  runIds: string[];
}

/** Run one or both PSI strategies through the canonical streamed collection. */
export async function syncPagespeed(
  dispatch: AppDispatch,
  pageId: string,
  organizationId: string,
  strategy: PagespeedStrategy = "mobile",
  callbacks: PagespeedSyncCallbacks = {},
): Promise<PagespeedSyncResult> {
  const runIds: string[] = [];
  let streamError: Error | null = null;
  const response = await dispatch(
    callApi({
      path: "/seo/pages/{page_id}/pagespeed/sync",
      method: "POST",
      pathParams: { page_id: pageId },
      body: { strategy },
      scopeOverrides: { organization_id: organizationId },
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        const progress = describePagespeedStreamEvent(event);
        if (progress) {
          callbacks.onProgress?.(progress);
          if (
            progress.stage === "complete" &&
            progress.runId &&
            !runIds.includes(progress.runId)
          ) {
            runIds.push(progress.runId);
          }
        }
        if (event.event === "error") {
          streamError = parseStreamError(event.data);
        }
      },
    }),
  );
  if (response.error) throw callApiError(response.error, response.requestId);
  if (streamError) throw streamError;
  return { runIds };
}
