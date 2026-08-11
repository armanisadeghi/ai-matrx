import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { callApi } from "@/lib/api/call-api";
import { parseStreamError, type BackendApiError } from "@/lib/api/errors";
import { getLatestCollectionFailure } from "@/features/marketing/data/collection-runs";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";

/**
 * GA4 persisted read/sync (M-74, WS-12).
 *
 * Reads go straight to Supabase (`seo.web_analytics_daily`, RLS-scoped by
 * `created_by`/org). The sync action calls
 * `POST /seo/sites/{site_id}/analytics/sync` — a detached NDJSON stream
 * through the canonical `run_collection` funnel, built from the site's live
 * `integrations.marketing.providers.google_analytics_4` binding.
 */

export interface WebAnalyticsDailyRow {
  id: string;
  date: string;
  landing_page: string | null;
  sessions: number;
  users: number;
  engaged_sessions: number;
  views: number;
  engagement_rate: number | null;
  key_events: number;
  conversions: number;
}

export async function listWebAnalyticsDaily(
  siteId: string,
  signal?: AbortSignal,
): Promise<WebAnalyticsDailyRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("web_analytics_daily")
    .select(
      "id, date, landing_page, sessions, users, engaged_sessions, views, engagement_rate, key_events, conversions",
    )
    .eq("site_id", siteId)
    .eq("provider", "ga4")
    .order("date", { ascending: false })
    .limit(30)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as WebAnalyticsDailyRow[];
}

/** Page-scoped slice of the same table — resolved server-side via
 * `resolve_ga4_page_resources` whenever a landing page matches a canonical
 * `web.page`, so this is a real FK filter, not a URL string match. */
export async function listWebAnalyticsDailyForPage(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<WebAnalyticsDailyRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("web_analytics_daily")
    .select(
      "id, date, landing_page, sessions, users, engaged_sessions, views, engagement_rate, key_events, conversions",
    )
    .eq("site_id", siteId)
    .eq("page_id", pageId)
    .eq("provider", "ga4")
    .order("date", { ascending: false })
    .limit(30)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as WebAnalyticsDailyRow[];
}

export async function getLatestAnalyticsFailure(
  siteId: string,
  signal?: AbortSignal,
): Promise<BackendApiError | null> {
  return getLatestCollectionFailure({ siteId }, "ga4", signal);
}

export interface AnalyticsSyncCallbacks {
  signal?: AbortSignal;
  onEvent?: (event: TypedStreamEvent) => void;
}

export interface AnalyticsSyncResult {
  runId: string | null;
}

export async function syncSiteAnalytics(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string,
  options: { windowDays?: number } = {},
  callbacks: AnalyticsSyncCallbacks = {},
): Promise<AnalyticsSyncResult> {
  let runId: string | null = null;
  let streamError: Error | null = null;
  const response = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/analytics/sync",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { window_days: options.windowDays ?? 28 },
      scopeOverrides: { organization_id: organizationId },
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        if (event.event === "data") {
          const data = event.data as { kind?: unknown; run_id?: unknown };
          if (data.kind === "seo.receipt" && typeof data.run_id === "string") {
            runId = data.run_id;
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
  return { runId };
}
