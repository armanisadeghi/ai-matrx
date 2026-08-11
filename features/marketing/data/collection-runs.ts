import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import {
  parsePersistedBackendError,
  type BackendApiError,
} from "@/lib/api/errors";

/**
 * ONE reader for the `seo.collection_run` ledger — the durable record of every
 * provider collection this platform has attempted.
 *
 * WHY THIS EXISTS: three surfaces (PageSpeed, GA4, the site settings status
 * panel) each needed "what happened on the last run, and if it failed, WHY".
 * Two of them had already grown their own private copy of the same query.
 * A failure the ledger recorded but no surface explains is the exact defect
 * the settings panel shipped with: a red "Failed" badge beside a sentence
 * about scheduling, and no way to learn what actually broke.
 *
 * Reads go straight to Supabase under RLS — this is a plain DB read and never
 * goes through the Python server.
 */

export interface CollectionRunSummary {
  id: string;
  provider: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  trigger: string;
  operation: string;
  request_id: string | null;
  error: unknown;
}

const RUN_COLUMNS =
  "id, provider, status, requested_at, completed_at, trigger, operation, request_id, error";

/** The most recent run for one provider, scoped to a site or a single page. */
export async function getLatestCollectionRun(
  target: { siteId: string } | { pageId: string },
  provider: string,
  signal?: AbortSignal,
): Promise<CollectionRunSummary | null> {
  await requireAuthenticatedSupabaseSession(supabase);
  let query = supabase
    .schema("seo")
    .from("collection_run")
    .select(RUN_COLUMNS)
    .eq("provider", provider);
  query =
    "siteId" in target
      ? query.eq("site_id", target.siteId)
      : query.eq("page_id", target.pageId);
  const response = await query
    .order("requested_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data?.[0] as CollectionRunSummary | undefined) ?? null;
}

/**
 * The failure of the most recent run, or null when the last run did NOT fail.
 * A run that succeeded after a failure means the failure is history — showing
 * it would be a false alarm.
 */
export async function getLatestCollectionFailure(
  target: { siteId: string } | { pageId: string },
  provider: string,
  signal?: AbortSignal,
): Promise<BackendApiError | null> {
  const latest = await getLatestCollectionRun(target, provider, signal);
  if (!latest || latest.status !== "failed") return null;
  return parsePersistedBackendError(latest.error, latest.request_id ?? "");
}

export interface ProviderRunHistory {
  /** Most recent run of any trigger. */
  latest: CollectionRunSummary;
  /**
   * When this site last had a run the platform started ITSELF. Proof that a
   * provider refreshes automatically — asserting "nightly" in the UI without
   * this is a claim, not a status.
   */
  lastScheduledAt: string | null;
}

/**
 * The recent run history for EVERY provider on one site, in a single request.
 * The status panel needs all seven at once; seven round-trips for a status
 * card is how a settings page becomes slow.
 */
export async function getLatestCollectionRunsBySite(
  siteId: string,
  signal?: AbortSignal,
): Promise<Record<string, ProviderRunHistory>> {
  await requireAuthenticatedSupabaseSession(supabase);
  const abort = signal ?? new AbortController().signal;
  const base = () =>
    supabase
      .schema("seo")
      .from("collection_run")
      .select(RUN_COLUMNS)
      .eq("site_id", siteId)
      .order("requested_at", { ascending: false });
  // Two bounded reads rather than one big scan: a single chatty provider can
  // fill any "recent N" window and make a quieter provider look like it has
  // never run automatically.
  const [recent, scheduled] = await Promise.all([
    base().limit(200).abortSignal(abort),
    base().eq("trigger", "scheduled").limit(100).abortSignal(abort),
  ]);
  if (recent.error) throw recent.error;
  if (scheduled.error) throw scheduled.error;

  const history: Record<string, ProviderRunHistory> = {};
  for (const row of (recent.data ?? []) as CollectionRunSummary[]) {
    if (!history[row.provider]) {
      history[row.provider] = { latest: row, lastScheduledAt: null };
    }
  }
  for (const row of (scheduled.data ?? []) as CollectionRunSummary[]) {
    const entry = history[row.provider];
    if (!entry) {
      history[row.provider] = {
        latest: row,
        lastScheduledAt: row.requested_at,
      };
    } else if (!entry.lastScheduledAt) {
      entry.lastScheduledAt = row.requested_at;
    }
  }
  return history;
}
