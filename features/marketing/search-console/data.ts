/**
 * Search Console dashboard reads — direct Supabase RPCs (`seo.gsc_perf_*`).
 *
 * Two-lane rule (CLAUDE.md data flow): all reads go DIRECT to the
 * RLS-protected `seo` schema under the caller's JWT. The only server call in
 * this feature is the on-demand sync trigger (compute), which lives in
 * `sync.ts`, not here. Accuracy contract (profile resolution, weighted
 * position, latest-fact dedup) is enforced INSIDE the RPCs —
 * `migrations/seo_gsc_perf_rpcs.sql`.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { Json } from "@/types/database.types";
import type {
  GscBreakdownQuery,
  GscBreakdownRow,
  GscFilters,
  GscFreshnessRow,
  GscResolvedPeriods,
  GscSummaryRow,
  GscTimeseriesRow,
} from "@/features/marketing/search-console/types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

function cleanFilters(filters: GscFilters): Json {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim() !== "") {
      out[key] = value.trim();
    }
  }
  return out;
}

function periodParams(periods: GscResolvedPeriods) {
  return {
    p_start: periods.current.start,
    p_end: periods.current.end,
    ...(periods.compare
      ? {
          p_compare_start: periods.compare.start,
          p_compare_end: periods.compare.end,
        }
      : {}),
  };
}

export async function getGscSummary(
  siteId: string,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  signal?: AbortSignal,
): Promise<GscSummaryRow | null> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_perf_summary", {
      p_site_id: siteId,
      ...periodParams(periods),
      p_filters: cleanFilters(filters),
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return rows[0] ?? null;
}

export async function getGscTimeseries(
  siteId: string,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  signal?: AbortSignal,
): Promise<GscTimeseriesRow[]> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_perf_timeseries", {
      p_site_id: siteId,
      ...periodParams(periods),
      p_filters: cleanFilters(filters),
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export interface GscBreakdownResult {
  rows: GscBreakdownRow[];
  total: number;
}

export async function getGscBreakdown(
  siteId: string,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  query: GscBreakdownQuery,
  signal?: AbortSignal,
): Promise<GscBreakdownResult> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_perf_breakdown", {
      p_site_id: siteId,
      p_dimension: query.dimension,
      ...periodParams(periods),
      p_filters: cleanFilters(filters),
      ...(query.search.trim() !== "" ? { p_search: query.search.trim() } : {}),
      p_sort: query.sort,
      p_sort_dir: query.sortDir,
      p_limit: query.pageSize,
      p_offset: (query.page - 1) * query.pageSize,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getGscFreshness(
  siteId: string,
  signal?: AbortSignal,
): Promise<GscFreshnessRow[]> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_perf_freshness", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}
