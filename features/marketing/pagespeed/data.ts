import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { buildHeaders, resolveBaseUrl } from "@/lib/python-client";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type { TypedStreamEvent } from "@/lib/api/types";

/**
 * PageSpeed Insights persisted read/sync (M-74/M-75, WS-12).
 *
 * Reads go straight to Supabase (`seo.page_performance`, RLS-scoped by
 * `created_by`/org — same doctrine as every other SEO fact table). The sync
 * action calls `POST /seo/pages/{page_id}/pagespeed/sync` — a detached
 * NDJSON stream through the canonical `run_collection` funnel.
 */

export interface PagePerformanceLighthouseMetric {
  numeric_value: number | null;
  numeric_unit: string | null;
  score: number | null;
  display_value: string | null;
}

export interface PagePerformanceRow {
  id: string;
  strategy: "mobile" | "desktop";
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  lighthouse: {
    metrics?: Record<string, PagePerformanceLighthouseMetric>;
    [key: string]: unknown;
  } | null;
  crux: {
    page?: { available?: boolean; overall_category?: string | null };
    origin?: { available?: boolean; overall_category?: string | null };
    [key: string]: unknown;
  } | null;
  observed_at: string;
}

export async function listPagePerformance(
  pageId: string,
  signal?: AbortSignal,
): Promise<PagePerformanceRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("page_performance")
    .select(
      "id, strategy, performance_score, accessibility_score, best_practices_score, seo_score, lighthouse, crux, observed_at",
    )
    .eq("page_id", pageId)
    .order("observed_at", { ascending: false })
    .limit(10)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as PagePerformanceRow[];
}

export interface PagespeedSyncCallbacks {
  signal?: AbortSignal;
  onEvent?: (event: TypedStreamEvent) => void;
}

export interface PagespeedSyncResult {
  runId: string | null;
}

export async function syncPagespeed(
  pageId: string,
  strategy: "mobile" | "desktop" = "mobile",
  callbacks: PagespeedSyncCallbacks = {},
): Promise<PagespeedSyncResult> {
  const { headers } = await buildHeaders({ signal: callbacks.signal }, true);
  const response = await fetch(
    `${resolveBaseUrl()}/seo/pages/${pageId}/pagespeed/sync`,
    {
      method: "POST",
      headers: { ...headers, Accept: "application/x-ndjson" },
      body: JSON.stringify({ strategy }),
      signal: callbacks.signal,
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
    };
    const detail = payload.detail;
    const message =
      typeof detail === "string"
        ? detail
        : typeof (detail as { message?: unknown })?.message === "string"
          ? ((detail as { message: string }).message as string)
          : `PageSpeed Insights sync failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  let runId: string | null = null;
  const { events } = parseNdjsonStream(response, callbacks.signal);
  for await (const event of events) {
    callbacks.onEvent?.(event);
    if (event.event === "data") {
      const data = event.data as { kind?: unknown; run_id?: unknown };
      if (data.kind === "seo.receipt" && typeof data.run_id === "string") {
        runId = data.run_id;
      }
    }
    if (event.event === "error") {
      const data = event.data as { message?: string; detail?: string };
      throw new Error(
        data.message || data.detail || "PageSpeed Insights sync failed.",
      );
    }
  }
  return { runId };
}
