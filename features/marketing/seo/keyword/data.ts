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

import type { Json } from "@/types/database.types";

import type { PageQueryStat, ResolvedKeyword } from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

async function webDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("web");
}

/**
 * Client-side mirror of `seo.fn_normalize_phrase` for lookups: lowercase,
 * trimmed, single-spaced. Persisted normalization stays server-owned — this
 * exists only to match against the stored `normalized_phrase` column.
 */
export function normalizeKeywordPhrase(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Ensure the universal keyword plane contains this phrase and return its id.
 * The SECURITY DEFINER RPC owns normalization and deduplication. Explicit
 * user entry also restores an archived identity; background upserts do not.
 */
export async function ensureKeywordId(phrase: string): Promise<string> {
  const trimmed = phrase.trim();
  if (!trimmed) throw new Error("Cannot use an empty keyword phrase.");
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .rpc("fn_upsert_keyword", { p_phrase: trimmed, p_language: "en" });
  if (response.error) throw response.error;
  const row = response.data as {
    o_id?: string | null;
    o_created?: boolean | null;
  } | null;
  if (!row?.o_id) {
    throw new Error(`Keyword upsert returned no id for "${trimmed}".`);
  }
  if (!row.o_created) {
    const restore = await supabase
      .schema("seo")
      .rpc("fn_restore_keywords", { p_keyword_ids: [row.o_id] });
    if (restore.error) throw restore.error;
  }
  return row.o_id;
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
  const response = await (
    await seoDb()
  )
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
  const response = await (
    await seoDb()
  )
    .from("search_performance_daily")
    .select("query, clicks, impressions, average_position, date")
    .eq("page_id", pageId)
    .eq("provider", "gsc")
    .eq("dimension_profile", "query_page")
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
    entry.positionWeight +=
      (row.average_position ?? 0) * (row.impressions ?? 0);
    byQuery.set(query, entry);
  }
  return [...byQuery.entries()]
    .map(([query, entry]): PageQueryStat => ({
      query,
      clicks: entry.clicks,
      impressions: entry.impressions,
      position:
        entry.impressions > 0 ? entry.positionWeight / entry.impressions : null,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/**
 * The stored Search Console evidence for ONE query on ONE page, aggregated
 * across the retained daily rows (clicks/impressions summed, impression-
 * weighted position). Same aggregation as `listPageTopQueries`, scoped to the
 * target phrase. Returns null when GSC has never surfaced this query for the
 * page.
 */
export async function getPageQueryStat(
  pageId: string,
  phrase: string,
  signal?: AbortSignal,
): Promise<
  (PageQueryStat & { firstDate: string | null; lastDate: string | null }) | null
> {
  const normalized = normalizeKeywordPhrase(phrase);
  if (!normalized) return null;
  const response = await (
    await seoDb()
  )
    .from("search_performance_daily")
    .select("query, clicks, impressions, average_position, date")
    .eq("page_id", pageId)
    .ilike("query", normalized)
    .order("date", { ascending: false })
    .limit(400)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const rows = response.data ?? [];
  if (rows.length === 0) return null;
  let clicks = 0;
  let impressions = 0;
  let positionWeight = 0;
  for (const row of rows) {
    clicks += row.clicks ?? 0;
    impressions += row.impressions ?? 0;
    positionWeight += (row.average_position ?? 0) * (row.impressions ?? 0);
  }
  const dates = rows.map((row) => row.date).sort();
  return {
    query: normalized,
    clicks,
    impressions,
    position: impressions > 0 ? positionWeight / impressions : null,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

/* ---------------------------------------------------------------- *
 * Rank + AI-answer evidence (seo.rank_target / rank_observation /
 * serp_snapshot) for one site + keyword.
 * ---------------------------------------------------------------- */

function jsonRecord(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}
function jsonNum(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}
function jsonBool(value: Json | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function jsonStr(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * One rank target's freshest observation, flattened for display. Organic
 * targets carry ranks + the matched URL (cannibalization evidence); AI-answer
 * targets (`result_type='ai_citation'`) carry cited/mentioned + the model.
 */
export interface RankTargetEvidence {
  targetId: string;
  engine: string;
  device: string;
  language: string;
  searchType: string;
  isActive: boolean;
  /** Null when the target exists but has never been checked. */
  provider: string | null;
  observedAt: string | null;
  organicRank: number | null;
  absoluteRank: number | null;
  resultType: string | null;
  matchedUrl: string | null;
  matchedDomain: string | null;
  /** AI-citation evidence (rank_observation.extras / serp_features). */
  aiCited: boolean | null;
  aiMentioned: boolean | null;
  aiModelName: string | null;
  aiCitationCount: number | null;
}

/**
 * Every rank target this site keeps on this keyword, each with its LATEST
 * observation (`seo.rank_target` + newest `seo.rank_observation` per target).
 */
export async function listRankEvidenceForKeyword(
  siteId: string,
  keywordId: string,
  signal?: AbortSignal,
): Promise<RankTargetEvidence[]> {
  const db = await seoDb();
  const abort = signal ?? new AbortController().signal;
  const targetsResponse = await db
    .from("rank_target")
    .select("id, engine, device, language, search_type, is_active")
    .eq("site_id", siteId)
    .eq("keyword_id", keywordId)
    .is("deleted_at", null)
    .abortSignal(abort);
  if (targetsResponse.error) throw targetsResponse.error;
  const targets = targetsResponse.data ?? [];
  if (targets.length === 0) return [];

  const observationsResponse = await db
    .from("rank_observation")
    .select(
      "rank_target_id, provider, observed_at, organic_rank, absolute_rank, result_type, matched_url, matched_domain, extras, serp_features",
    )
    .in(
      "rank_target_id",
      targets.map((target) => target.id),
    )
    .order("observed_at", { ascending: false })
    .limit(120)
    .abortSignal(abort);
  if (observationsResponse.error) throw observationsResponse.error;
  const latestByTarget = new Map<
    string,
    NonNullable<typeof observationsResponse.data>[number]
  >();
  for (const observation of observationsResponse.data ?? []) {
    if (!latestByTarget.has(observation.rank_target_id)) {
      latestByTarget.set(observation.rank_target_id, observation);
    }
  }

  return targets.map((target): RankTargetEvidence => {
    const observation = latestByTarget.get(target.id) ?? null;
    const extras = jsonRecord(observation?.extras);
    const features = jsonRecord(observation?.serp_features);
    return {
      targetId: target.id,
      engine: target.engine,
      device: target.device,
      language: target.language,
      searchType: target.search_type,
      isActive: target.is_active,
      provider: observation?.provider ?? null,
      observedAt: observation?.observed_at ?? null,
      organicRank: observation?.organic_rank ?? null,
      absoluteRank: observation?.absolute_rank ?? null,
      resultType: observation?.result_type ?? null,
      matchedUrl: observation?.matched_url ?? null,
      matchedDomain: observation?.matched_domain ?? null,
      aiCited: jsonBool(extras.cited),
      aiMentioned: jsonBool(extras.mentioned),
      aiModelName: jsonStr(extras.model_name),
      aiCitationCount: jsonNum(features.citation_count),
    };
  });
}

/** The freshest stored AI-answer run for a keyword, with its citation list. */
export interface AiAnswerEvidence {
  engine: string;
  provider: string;
  observedAt: string;
  citationCount: number | null;
  answerChars: number | null;
  citations: Array<{
    rank: number;
    domain: string | null;
    url: string | null;
    title: string | null;
  }>;
}

/**
 * Latest `seo.serp_snapshot` with `search_type='ai_answer'` for this keyword
 * (org-scoped by RLS) plus its `serp_result` citation rows — the stored
 * evidence of what an AI search engine answered and which sources it cited.
 */
export async function getLatestAiAnswerEvidence(
  keywordId: string,
  signal?: AbortSignal,
): Promise<AiAnswerEvidence | null> {
  const response = await (
    await seoDb()
  )
    .from("serp_snapshot")
    .select(
      "engine, provider, observed_at, serp_features, serp_result(absolute_rank, domain, url, title)",
    )
    .eq("keyword_id", keywordId)
    .eq("search_type", "ai_answer")
    .order("observed_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) return null;
  const features = jsonRecord(response.data.serp_features);
  return {
    engine: response.data.engine,
    provider: response.data.provider,
    observedAt: response.data.observed_at,
    citationCount: jsonNum(features.citation_count),
    answerChars: jsonNum(features.answer_chars),
    citations: (response.data.serp_result ?? [])
      .map((row) => ({
        rank: row.absolute_rank,
        domain: row.domain,
        url: row.url,
        title: row.title,
      }))
      .sort((a, b) => a.rank - b.rank),
  };
}

/** User-selectable Search Console reporting ranges (null days = all stored data). */
export const GSC_RANGES = [
  { key: "28d", label: "28d", days: 28 },
  { key: "90d", label: "90d", days: 90 },
  { key: "12m", label: "12m", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

export type GscRangeKey = (typeof GSC_RANGES)[number]["key"];

export function gscRangeDays(range: GscRangeKey): number | null {
  const entry = GSC_RANGES.find((candidate) => candidate.key === range);
  return entry ? entry.days : 28;
}

/** ISO date (YYYY-MM-DD) lower bound for a range, or null for all time. */
function gscCutoffDate(days: number | null): string | null {
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const GSC_FETCH_PAGE_SIZE = 1000;

interface DailyPerformanceRow {
  query: string | null;
  clicks: number;
  impressions: number;
  average_position: number | null;
  date: string;
}

interface GscPageStatRow {
  clicks: number;
  impressions: number;
  position: number | null;
  date: string;
}

/**
 * Bounded, stably-ordered read of `web.gsc_page_stat` — the table the scraper
 * GSC sync actually writes. Page totals, KPI strip, and v_page_list all read
 * this path; `seo.search_performance_daily` is populated separately and may be
 * empty for sites that have only completed the scraper sync.
 */
async function fetchGscPageStatRows(
  pageId: string,
  days: number | null,
  maxPages: number,
  signal?: AbortSignal,
): Promise<{ rows: GscPageStatRow[]; truncated: boolean }> {
  const db = await webDb();
  const cutoff = gscCutoffDate(days);
  const rows: GscPageStatRow[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    let request = db
      .from("gsc_page_stat")
      .select("clicks, impressions, position, date")
      .eq("page_id", pageId)
      .is("deleted_at", null);
    if (cutoff) request = request.gte("date", cutoff);
    const response = await request
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(
        pageIndex * GSC_FETCH_PAGE_SIZE,
        pageIndex * GSC_FETCH_PAGE_SIZE + GSC_FETCH_PAGE_SIZE - 1,
      )
      .abortSignal(signal ?? new AbortController().signal);
    if (response.error) throw response.error;
    const batch = (response.data ?? []) as GscPageStatRow[];
    rows.push(...batch);
    if (batch.length < GSC_FETCH_PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

/**
 * Bounded, stably-ordered read of `seo.search_performance_daily` for one
 * canonical page + the query_page GSC profile. Pages via `.range()` (newest
 * dates first, id as the unique tiebreaker — the unstable-pagination class)
 * up to `maxPages`; `truncated` is true when the cap was hit, so callers can
 * say so instead of presenting a silent undercount as the truth.
 */
async function fetchGscDailyRows(
  pageId: string,
  days: number | null,
  maxPages: number,
  signal?: AbortSignal,
): Promise<{ rows: DailyPerformanceRow[]; truncated: boolean }> {
  const db = await seoDb();
  const cutoff = gscCutoffDate(days);
  const rows: DailyPerformanceRow[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    let request = db
      .from("search_performance_daily")
      .select("query, clicks, impressions, average_position, date")
      .eq("page_id", pageId)
      .eq("provider", "gsc")
      .eq("dimension_profile", "query_page");
    if (cutoff) request = request.gte("date", cutoff);
    const response = await request
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(
        pageIndex * GSC_FETCH_PAGE_SIZE,
        pageIndex * GSC_FETCH_PAGE_SIZE + GSC_FETCH_PAGE_SIZE - 1,
      )
      .abortSignal(signal ?? new AbortController().signal);
    if (response.error) throw response.error;
    const batch = (response.data ?? []) as DailyPerformanceRow[];
    rows.push(...batch);
    if (batch.length < GSC_FETCH_PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

/** Range totals for one page from the daily page-profile GSC rows. */
export interface PageSearchTotals {
  clicks: number;
  impressions: number;
  /** clicks / impressions, null when impressions are 0. */
  ctr: number | null;
  /** Impression-weighted average position, null when impressions are 0. */
  position: number | null;
  /** Distinct dates with stored data inside the range. */
  reportedDays: number;
  /** Newest stored date inside the range, or null when empty. */
  lastDate: string | null;
  truncated: boolean;
}

/**
 * Clicks / impressions / CTR / weighted position for one canonical page over
 * a selectable range, aggregated from `web.gsc_page_stat` (the scraper sync
 * target — same source as v_page_list and the KPI strip).
 */
export async function getPageSearchTotals(
  pageId: string,
  days: number | null,
  signal?: AbortSignal,
): Promise<PageSearchTotals> {
  const { rows, truncated } = await fetchGscPageStatRows(
    pageId,
    days,
    3,
    signal,
  );
  let clicks = 0;
  let impressions = 0;
  let positionWeight = 0;
  const dates = new Set<string>();
  let lastDate: string | null = null;
  for (const row of rows) {
    clicks += row.clicks ?? 0;
    impressions += row.impressions ?? 0;
    positionWeight += (row.position ?? 0) * (row.impressions ?? 0);
    dates.add(row.date);
    if (lastDate === null || row.date > lastDate) lastDate = row.date;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? positionWeight / impressions : null,
    reportedDays: dates.size,
    lastDate,
    truncated,
  };
}

export interface PageQueryStatsResult {
  stats: PageQueryStat[];
  /** True when the bounded read capped out — the numbers are then a floor
   * over the newest stored rows, not the full range. Say so in the UI. */
  truncated: boolean;
}

/**
 * Range-aware per-query breakdown for one canonical page: the
 * `dimension_profile='query_page'` GSC rows aggregated per query
 * (clicks/impressions summed, impression-weighted position), strongest
 * first. Same aggregation as `listPageTopQueries`, but with a selectable
 * range, the complete aggregated result, and a loud raw-read truncation flag.
 */
export async function listPageQueryStats(
  pageId: string,
  days: number | null,
  signal?: AbortSignal,
): Promise<PageQueryStatsResult> {
  const { rows, truncated } = await fetchGscDailyRows(pageId, days, 10, signal);
  const byQuery = new Map<
    string,
    { clicks: number; impressions: number; positionWeight: number }
  >();
  for (const row of rows) {
    const query = row.query?.trim();
    if (!query) continue;
    const entry = byQuery.get(query) ?? {
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    entry.clicks += row.clicks ?? 0;
    entry.impressions += row.impressions ?? 0;
    entry.positionWeight +=
      (row.average_position ?? 0) * (row.impressions ?? 0);
    byQuery.set(query, entry);
  }
  const stats = [...byQuery.entries()]
    .map(([query, entry]): PageQueryStat => ({
      query,
      clicks: entry.clicks,
      impressions: entry.impressions,
      position:
        entry.impressions > 0 ? entry.positionWeight / entry.impressions : null,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  return { stats, truncated };
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
  const response = await (
    await seoDb()
  )
    .from("v_site_keyword_performance")
    .select("*")
    .eq("site_id", siteId)
    .eq("keyword_id", keywordId)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as SiteKeywordPerformanceRow[];
}
