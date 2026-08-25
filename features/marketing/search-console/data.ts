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
import {
  GSC_RANGE_FILTERS,
  parseLevelFilter,
  parseStampFilter,
} from "@/features/marketing/search-console/types";
import type { Json } from "@/types/database.types";
import type {
  GscBreakdownQuery,
  GscIngestionHealthRow,
  GscBreakdownRow,
  GscFilters,
  GscFreshnessRow,
  GscResolvedPeriods,
  GscSummaryRow,
  GscTimeseriesRow,
} from "@/features/marketing/search-console/types";
import { makeAssertData } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your Search Console data");

const RANGE_FILTER_KEYS = new Set<string>([
  ...GSC_RANGE_FILTERS.flatMap((r) => [r.min as string, r.max as string]),
  // MSR-03/04 — CTR and value-score ranges (not toolbar chips yet, but the
  // table's own column filters wire straight through the same bag).
  "ctr_min",
  "ctr_max",
  "value_score_min",
  "value_score_max",
]);

/**
 * The filter bag as the RPCs want it. Exported because the C14 Keyword
 * Workbench calls `gsc_breakdown_keyword_ids` with the SAME bag — two
 * translations of one filter set is how "select all matching" quietly stops
 * matching what the table shows.
 */
export function cleanGscFilters(filters: GscFilters): Json {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (key === "stamps") {
      // C6: `dim:value|dim:value` → [{dimension, value}] (all-of) for the RPC
      const pairs = parseStampFilter(value).map((p) => ({
        dimension: p.dimension,
        value: p.value,
      }));
      if (pairs.length > 0) out.stamps = pairs;
      continue;
    }
    if (key === "levels") {
      const levels = parseLevelFilter(value);
      if (levels.length > 0) out.levels = levels;
      continue;
    }
    if (key === "traffic_classes") {
      // MSR-03/04 — same pipe encoding as `levels`, RPC key `traffic_classes`.
      const classes = parseLevelFilter(value);
      if (classes.length > 0) out.traffic_classes = classes;
      continue;
    }
    // C14 metric ranges: a bound that is not a number is dropped rather than
    // sent — the RPC casts blindly, and `NaN` there is a 500, not a filter.
    if (RANGE_FILTER_KEYS.has(key)) {
      const n = Number(value.trim());
      if (Number.isFinite(n)) out[key] = String(n);
      continue;
    }
    out[key] = value.trim();
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
      p_filters: cleanGscFilters(filters),
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
      p_filters: cleanGscFilters(filters),
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
      p_filters: cleanGscFilters(filters),
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

export type GscBackfillStatusRow =
  import("@/types/database.types").Database["seo"]["Functions"]["gsc_backfill_status"]["Returns"][number];

/**
 * Live backfill status — the SERVER truth for "is a history import running
 * right now?". Client state dies on refresh; this doesn't.
 */
export async function getGscBackfillStatus(
  siteId: string,
  signal?: AbortSignal,
): Promise<GscBackfillStatusRow | null> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_backfill_status", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw new Error(response.error.message);
  return response.data?.[0] ?? null;
}

/**
 * Ingestion health for one site — the SURFACING read behind the dashboard's
 * warning banner. Answers "is this site's data actually being kept current,
 * and if not, why?" in one call (`migrations/seo_gsc_ingestion_health.sql`).
 *
 * This exists because a five-day total ingestion outage was fully recorded
 * server-side and surfaced NOWHERE — the dashboard served one stale day as
 * if it were the whole truth.
 */
export async function getGscIngestionHealth(
  siteId: string,
  signal?: AbortSignal,
): Promise<GscIngestionHealthRow | null> {
  const response = await (
    await seoDb()
  )
    .rpc("gsc_ingestion_health", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return rows[0] ?? null;
}
