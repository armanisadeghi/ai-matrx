/**
 * Coverage reads — direct Supabase, like every other data read in this client.
 *
 * The server writes `seo.coverage_tracker` / `seo.coverage_mention`; this file
 * only ever selects from them. Share-of-voice is derived from the rows we just
 * fetched (never a stored rollup), so the headline percentage and the list
 * under it are computed from one set of rows and cannot disagree.
 */

import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type {
  CoverageMentionRow,
  CoveragePagedResult,
  CoverageShareOfVoice,
  CoverageSummary,
  CoverageTrackerRow,
  CoverageVoiceShare,
} from "@/features/marketing/data/coverage-types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

/** The default reporting window, matched to the server's `DEFAULT_WINDOW_DAYS`. */
export const COVERAGE_WINDOW_DAYS = 30;

export interface CoverageFilters {
  /** One tracker, or every tracker on the site. */
  trackerId?: string;
  /** Competitors are hidden by default: the feed is about YOUR coverage. */
  includeCompetitors?: boolean;
  /** Only the pieces that link to you — mentions that became assets. */
  linkedOnly?: boolean;
  windowDays?: number;
}

const SORT_COLUMNS: Record<string, string> = {
  discovered_at: "discovered_at",
  published_at: "published_at",
  hit_score: "hit_score",
  domain: "domain",
  sentiment: "sentiment",
  prominence: "prominence",
};

function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error instanceof Error ? error : new Error(String(error));
  if (data === null) throw new Error("Coverage query returned no data.");
  return data;
}

function rangeFor(state: MatrxDataTableQueryState) {
  const from = (state.page - 1) * state.pageSize;
  return { from, to: from + state.pageSize - 1 };
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\]/g, " ");
}

function sinceIso(windowDays: number): string {
  return new Date(Date.now() - windowDays * 86_400_000).toISOString();
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

export async function listCoverageTrackers(
  siteId: string,
  signal?: AbortSignal,
): Promise<CoverageTrackerRow[]> {
  const response = await (await seoDb())
    .from("coverage_tracker")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function listCoverageMentions(
  siteId: string,
  state: MatrxDataTableQueryState,
  filters: CoverageFilters = {},
  signal?: AbortSignal,
): Promise<CoveragePagedResult> {
  const { from, to } = rangeFor(state);
  let query = (await seoDb())
    .from("coverage_mention")
    .select("*", { count: "exact" })
    .eq("site_id", siteId)
    .gte("discovered_at", sinceIso(filters.windowDays ?? COVERAGE_WINDOW_DAYS));

  if (filters.trackerId) query = query.eq("tracker_id", filters.trackerId);
  if (!filters.includeCompetitors) query = query.eq("is_competitor", false);
  if (filters.linkedOnly) query = query.eq("links_to_site", true);

  const search = cleanSearch(state.search);
  if (search) {
    query = query.or(
      `domain.ilike.%${search}%,title.ilike.%${search}%,author_name.ilike.%${search}%`,
    );
  }

  const sortColumn = state.sort
    ? (SORT_COLUMNS[state.sort.id] ?? "discovered_at")
    : "discovered_at";
  const ascending = state.sort ? state.sort.direction === "asc" : false;

  const response = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    // Ties break on how loud the piece is, then on id, so paging is stable.
    .order("hit_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to)
    .abortSignal(signal ?? new AbortController().signal);

  return {
    rows: assertData(response.data, response.error),
    total: response.count ?? 0,
  };
}

/**
 * Every mention in the window, competitors included — the rollup input.
 * Bounded, because a rollup over thousands of rows is a report, not a tile.
 */
async function listVoiceRows(
  siteId: string,
  filters: CoverageFilters,
  signal?: AbortSignal,
): Promise<CoverageMentionRow[]> {
  let query = (await seoDb())
    .from("coverage_mention")
    .select("*")
    .eq("site_id", siteId)
    .gte("discovered_at", sinceIso(filters.windowDays ?? COVERAGE_WINDOW_DAYS))
    .order("discovered_at", { ascending: false })
    .limit(1000);
  if (filters.trackerId) query = query.eq("tracker_id", filters.trackerId);
  const response = await query.abortSignal(
    signal ?? new AbortController().signal,
  );
  return assertData(response.data, response.error);
}

/**
 * Brand vs tracked competitors. This answers *"am I written about more than
 * them"* over the set the customer declared — never "share of all news", which
 * nobody can measure.
 */
export function shareOfVoice(
  rows: CoverageMentionRow[],
  brandKey: string,
  brandLabel?: string,
): CoverageShareOfVoice {
  const buckets = new Map<string, CoverageMentionRow[]>([[brandKey, []]]);
  for (const row of rows) {
    const key = row.is_competitor
      ? (row.competitor_key ?? "unattributed")
      : brandKey;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const total = rows.length;
  const entries: CoverageVoiceShare[] = [...buckets.entries()].map(
    ([key, bucket]) => {
      const scored = bucket
        .map((row) => row.hit_score)
        .filter((score): score is number => score !== null);
      return {
        key,
        label: key === brandKey ? (brandLabel ?? brandKey) : key,
        mentions: bucket.length,
        sharePct: total
          ? Math.round((1000 * bucket.length) / total) / 10
          : 0,
        linkedMentions: bucket.filter((row) => row.links_to_site).length,
        avgHitScore: scored.length
          ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
          : null,
        isBrand: key === brandKey,
      };
    },
  );
  entries.sort((a, b) => {
    if (a.isBrand !== b.isBrand) return a.isBrand ? -1 : 1;
    if (a.mentions !== b.mentions) return b.mentions - a.mentions;
    return a.key.localeCompare(b.key);
  });

  return {
    totalMentions: total,
    entries,
    brandSharePct: entries.find((entry) => entry.isBrand)?.sharePct ?? 0,
  };
}

export function summarize(rows: CoverageMentionRow[]): CoverageSummary {
  const brand = rows.filter((row) => !row.is_competitor);
  const scored = brand
    .map((row) => row.hit_score)
    .filter((score): score is number => score !== null);
  return {
    total: rows.length,
    brandMentions: brand.length,
    linked: brand.filter((row) => row.links_to_site).length,
    analyzed: brand.filter((row) => row.analyzed_at !== null).length,
    awaitingCapture: brand.filter((row) => row.capture_status === "pending")
      .length,
    blocked: brand.filter((row) => row.capture_status === "blocked").length,
    avgHitScore: scored.length
      ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
      : null,
    credited: brand.filter((row) => row.outcome_event_id !== null).length,
  };
}

export async function getCoverageRollup(
  siteId: string,
  brandKey: string,
  filters: CoverageFilters = {},
  signal?: AbortSignal,
): Promise<{ share: CoverageShareOfVoice; summary: CoverageSummary }> {
  const rows = await listVoiceRows(siteId, filters, signal);
  return {
    share: shareOfVoice(rows, brandKey),
    summary: summarize(rows),
  };
}
