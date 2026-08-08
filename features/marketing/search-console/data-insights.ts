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

const INSIGHT_ROW_LIMIT = 200;

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

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

export async function getGscClassMovers(
  siteId: string,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  trafficClass: GscTrafficClass | null,
  direction: "gain" | "loss",
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
