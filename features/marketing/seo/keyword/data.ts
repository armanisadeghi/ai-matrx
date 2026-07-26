/**
 * Canonical keyword primitive — direct Supabase reads.
 *
 * Two-lane rule (CLAUDE.md data flow): every read here goes DIRECT to the
 * RLS-protected `seo` schema under the caller's JWT; compute (research,
 * volume refresh, rank checks) stays on aidream and lives in the hooks/tabs
 * that trigger it. Never add a Python read proxy here.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { US_LOCATION_CODE } from "@/features/marketing/seo/keyword-research/types";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
  SiteKeywordPerformanceRow,
} from "@/features/marketing/seo/keyword-research/types";

import type { PageQueryStat, ResolvedKeyword } from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/**
 * Client-side mirror of `seo.fn_normalize_phrase` for lookups: lowercase,
 * trimmed, single-spaced. Persisted normalization stays server-owned — this
 * exists only to match against the stored `normalized_phrase` column.
 */
export function normalizeKeywordPhrase(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}

/** The freshest market row for a keyword, preferring the US market. */
export function pickKeywordMarket(
  markets: KeywordMarketRow[] | null | undefined,
): KeywordMarketRow | null {
  if (!markets || markets.length === 0) return null;
  const us = markets.filter((row) => row.location_code === US_LOCATION_CODE);
  const pool = us.length > 0 ? us : markets;
  return [...pool].sort((a, b) =>
    (b.metrics_fetched_at ?? "").localeCompare(a.metrics_fetched_at ?? ""),
  )[0];
}

/**
 * Resolve a phrase against the universal keyword plane (exact match on the
 * normalized phrase). Returns the library row + its freshest market data, or
 * `{ keyword: null, market: null }` when the phrase is unknown.
 */
export async function resolveKeyword(
  phrase: string,
  signal?: AbortSignal,
): Promise<ResolvedKeyword> {
  const normalized = normalizeKeywordPhrase(phrase);
  if (!normalized) return { keyword: null, market: null };
  const response = await (await seoDb())
    .from("keyword")
    .select("*, keyword_market(*)")
    .eq("normalized_phrase", normalized)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  const keyword = (response.data as KeywordWithMarket | null) ?? null;
  return { keyword, market: pickKeywordMarket(keyword?.keyword_market) };
}

/**
 * The real Search Console queries already reaching one canonical page,
 * aggregated per query (clicks/impressions summed, impression-weighted
 * position), strongest first. Bounded read of the newest daily rows.
 */
export async function listPageTopQueries(
  pageId: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<PageQueryStat[]> {
  const response = await (await seoDb())
    .from("search_performance_daily")
    .select("query, clicks, impressions, average_position, date")
    .eq("page_id", pageId)
    .order("date", { ascending: false })
    .limit(1000)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const byQuery = new Map<
    string,
    { clicks: number; impressions: number; positionWeight: number }
  >();
  for (const row of response.data ?? []) {
    const query = row.query?.trim();
    if (!query) continue;
    const entry = byQuery.get(query) ?? {
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    entry.clicks += row.clicks ?? 0;
    entry.impressions += row.impressions ?? 0;
    entry.positionWeight += (row.average_position ?? 0) * (row.impressions ?? 0);
    byQuery.set(query, entry);
  }
  return [...byQuery.entries()]
    .map(
      ([query, entry]): PageQueryStat => ({
        query,
        clicks: entry.clicks,
        impressions: entry.impressions,
        position:
          entry.impressions > 0
            ? entry.positionWeight / entry.impressions
            : null,
      }),
    )
    .sort(
      (a, b) => b.clicks - a.clicks || b.impressions - a.impressions,
    )
    .slice(0, limit);
}

/**
 * This site's organic performance + workflow state for ONE keyword — the
 * same `seo.v_site_keyword_performance` read model the site Keywords
 * workspace pages through, scoped to a keyword id (one row per provider).
 */
export async function listSitePerformanceForKeyword(
  siteId: string,
  keywordId: string,
  signal?: AbortSignal,
): Promise<SiteKeywordPerformanceRow[]> {
  const response = await (await seoDb())
    .from("v_site_keyword_performance")
    .select("*")
    .eq("site_id", siteId)
    .eq("keyword_id", keywordId)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as SiteKeywordPerformanceRow[];
}
