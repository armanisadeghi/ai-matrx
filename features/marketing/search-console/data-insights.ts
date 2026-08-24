/**
 * Insights data access — the three algorithm RPCs
 * (`seo.gsc_perf_ctr_gap` / `gsc_perf_cannibalization` / `gsc_perf_trend`),
 * direct Supabase reads. The algorithms live server-side ONCE (they compose
 * the winning-run dedup + weighted-aggregate accuracy contract) — never
 * re-implement a score over client rows. Each caller fetches a bounded
 * top-N (default 200) and the table pages client-side, like Dig Here.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type {
  GscCannibalizationRow,
  GscClassMoverRow,
  GscClassSummaryRow,
  GscCtrGapRow,
  GscJuiceRow,
  GscResolvedPeriods,
  GscShiftRow,
  GscTrafficClass,
  GscTrendRow,
} from "@/features/marketing/search-console/types";
import { makeAssertData } from "@/utils/errors";
import type { ValueReason } from "@/features/marketing/seo/value-system/types";

const INSIGHT_ROW_LIMIT = 200;

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your Search Console insights");

export interface GscInsightResult<T> {
  rows: T[];
  total: number;
}

export async function getGscCtrGap(
  siteId: string,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  minImpressions: number,
  signal?: AbortSignal,
): Promise<GscInsightResult<GscCtrGapRow>> {
  const response = await (await seoDb())
    .rpc("gsc_perf_ctr_gap", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_dimension: dimension,
      p_min_impressions: minImpressions,
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getGscCannibalization(
  siteId: string,
  periods: GscResolvedPeriods,
  minImpressions: number,
  signal?: AbortSignal,
): Promise<GscInsightResult<GscCannibalizationRow>> {
  const response = await (await seoDb())
    .rpc("gsc_perf_cannibalization", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_min_impressions: minImpressions,
      p_min_share: 0.2,
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Compare bounds are REQUIRED for the class views — callers fall back to
 *  the previous period via `withPrevCompare` when no compare is active. */
function requireCompare(periods: GscResolvedPeriods): {
  start: string;
  end: string;
} {
  if (!periods.compare) {
    throw new Error("Class insights require a compare period");
  }
  return periods.compare;
}

export async function getGscClassSummary(
  siteId: string,
  periods: GscResolvedPeriods,
  signal?: AbortSignal,
): Promise<GscClassSummaryRow[]> {
  const compare = requireCompare(periods);
  const response = await (await seoDb())
    .rpc("gsc_perf_class_summary", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_compare_start: compare.start,
      p_compare_end: compare.end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function getGscPageClassSummary(
  siteId: string,
  pageId: string,
  periods: GscResolvedPeriods,
  signal?: AbortSignal,
): Promise<GscClassSummaryRow[]> {
  const compare = requireCompare(periods);
  const response = await (await seoDb())
    .rpc("gsc_perf_page_class_summary", {
      p_site_id: siteId,
      p_page_id: pageId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_compare_start: compare.start,
      p_compare_end: compare.end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function getGscKeywordClassesByText(
  siteId: string,
  queries: readonly string[],
  signal?: AbortSignal,
) {
  const response = await (await seoDb())
    .rpc("gsc_keyword_class_by_text", {
      p_site_id: siteId,
      p_queries: [...queries],
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/**
 * C6 — movers, optionally narrowed to one or more value LEVELS. Levels resolve
 * server-side through `seo.keyword_value_map` (the ONE resolver) and arrive
 * back on each row as `value_band`, so Class and Level read the same way.
 */
export async function getGscClassMovers(
  siteId: string,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  trafficClass: GscTrafficClass | null,
  direction: "gain" | "loss",
  levels: readonly string[] = [],
  signal?: AbortSignal,
): Promise<GscInsightResult<GscClassMoverRow>> {
  const compare = requireCompare(periods);
  const response = await (await seoDb())
    .rpc("gsc_perf_class_movers", {
      p_site_id: siteId,
      p_dimension: dimension,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_compare_start: compare.start,
      p_compare_end: compare.end,
      ...(trafficClass ? { p_class: trafficClass } : {}),
      p_direction: direction,
      ...(levels.length > 0 ? { p_filters: { levels: [...levels] } } : {}),
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getGscShifts(
  siteId: string,
  periods: GscResolvedPeriods,
  minClicks: number,
  signal?: AbortSignal,
): Promise<GscInsightResult<GscShiftRow>> {
  const compare = requireCompare(periods);
  const response = await (await seoDb())
    .rpc("gsc_perf_shifts", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_compare_start: compare.start,
      p_compare_end: compare.end,
      p_min_clicks: minClicks,
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getGscJuice(
  siteId: string,
  monthMinClicks: number,
  minMonths: number,
  signal?: AbortSignal,
): Promise<GscInsightResult<GscJuiceRow>> {
  const response = await (await seoDb())
    .rpc("gsc_perf_juice", {
      p_site_id: siteId,
      p_month_min_clicks: monthMinClicks,
      p_min_months: minMonths,
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getGscTrend(
  siteId: string,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  direction: "decay" | "growth",
  minClicks: number,
  signal?: AbortSignal,
): Promise<GscInsightResult<GscTrendRow>> {
  const response = await (await seoDb())
    .rpc("gsc_perf_trend", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_dimension: dimension,
      p_direction: direction,
      p_min_clicks: minClicks,
      p_limit: INSIGHT_ROW_LIMIT,
      p_offset: 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/**
 * C6 — Class / Score / Level for EXACTLY the keyword rows a table is showing
 * (THE SCOPE RULE: never the whole site from the browser). One RPC, one map.
 */
export interface GscKeywordValueRow {
  keyword_id: string;
  traffic_class: string | null;
  class_source: string | null;
  value_score: number | null;
  value_band: string | null;
  value_source: string | null;
  /**
   * THE RECEIPT. A tier never renders without its why (value-system.md), so
   * the same call that gives a table its Level column gives it the reasons
   * behind that level — no second round trip for the (i) popover.
   */
  reasons: ValueReason[];
}

/**
 * The MULTI-SITE batch variant (KI-026, cross-site surfaces): pairs of
 * (site, keyword ids) resolve through the same single-site function per site
 * — one resolver, per-site access asserted, a partial answer impossible.
 * Keys of the returned map are `${site_id}:${keyword_id}`.
 */
export async function getGscKeywordValueForMulti(
  pairs: Array<{ siteId: string; keywordIds: string[] }>,
  signal?: AbortSignal,
): Promise<Map<string, GscKeywordValueRow>> {
  const real = pairs.filter((pair) => pair.keywordIds.length > 0);
  if (real.length === 0) return new Map();
  const response = await (await seoDb())
    .rpc("gsc_keyword_value_for_multi", {
      p_pairs: real.map((pair) => ({
        site_id: pair.siteId,
        keyword_ids: pair.keywordIds,
      })),
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error) as Array<
    Omit<GscKeywordValueRow, "reasons"> & { site_id: string; reasons: unknown }
  >;
  return new Map(
    rows.map((row) => [
      `${row.site_id}:${row.keyword_id}`,
      {
        ...row,
        reasons: Array.isArray(row.reasons)
          ? (row.reasons as ValueReason[])
          : [],
      },
    ]),
  );
}

export async function getGscKeywordValueFor(
  siteId: string,
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, GscKeywordValueRow>> {
  if (keywordIds.length === 0) return new Map();
  const response = await (await seoDb())
    .rpc("gsc_keyword_value_for", { p_site_id: siteId, p_keyword_ids: keywordIds })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error) as Array<
    Omit<GscKeywordValueRow, "reasons"> & { reasons: unknown }
  >;
  return new Map(
    rows.map((row) => [
      row.keyword_id,
      {
        ...row,
        reasons: Array.isArray(row.reasons)
          ? (row.reasons as ValueReason[])
          : [],
      },
    ]),
  );
}
