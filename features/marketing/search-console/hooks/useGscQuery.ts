/**
 * The one hook family for Search Console reads — react-query over the
 * `seo.gsc_perf_*` RPC callers, keyed on (site, periods, filters, query) so
 * every filter chip, range change, and table page is its own cache entry.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getGscBackfillStatus,
  getGscBreakdown,
  getGscFreshness,
  getGscSummary,
  getGscTimeseries,
} from "@/features/marketing/search-console/data";
import {
  getGscCannibalization,
  getGscClassMovers,
  getGscClassSummary,
  getGscKeywordClassesByText,
  getGscKeywordValueFor,
  getGscPageClassSummary,
  getGscCtrGap,
  getGscJuice,
  getGscShifts,
  getGscTrend,
  type GscKeywordValueRow,
} from "@/features/marketing/search-console/data-insights";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/normalize";
import type {
  GscBreakdownQuery,
  GscFilters,
  GscResolvedPeriods,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";

const STALE_MS = 5 * 60 * 1000;

function periodsKey(periods: GscResolvedPeriods): string {
  return [
    periods.current.start,
    periods.current.end,
    periods.compare?.start ?? "",
    periods.compare?.end ?? "",
  ].join("|");
}

function filtersKey(filters: GscFilters): string {
  return Object.entries(filters)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export function useGscSummary(
  siteId: string | null,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "summary",
      siteId,
      periodsKey(periods),
      filtersKey(filters),
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscSummary(siteId, periods, filters, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscTimeseries(
  siteId: string | null,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "timeseries",
      siteId,
      periodsKey(periods),
      filtersKey(filters),
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscTimeseries(siteId, periods, filters, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscBreakdown(
  siteId: string | null,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  query: GscBreakdownQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "breakdown",
      siteId,
      periodsKey(periods),
      filtersKey(filters),
      query.dimension,
      query.search,
      query.sort,
      query.sortDir,
      query.page,
      query.pageSize,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscBreakdown(siteId, periods, filters, query, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscCtrGap(
  siteId: string | null,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  minImpressions: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-ctr-gap",
      siteId,
      periodsKey(periods),
      dimension,
      minImpressions,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscCtrGap(siteId, periods, dimension, minImpressions, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscCannibalization(
  siteId: string | null,
  periods: GscResolvedPeriods,
  minImpressions: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-cannibalization",
      siteId,
      periodsKey(periods),
      minImpressions,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscCannibalization(siteId, periods, minImpressions, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscTrend(
  siteId: string | null,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  direction: "decay" | "growth",
  minClicks: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-trend",
      siteId,
      periodsKey(periods),
      dimension,
      direction,
      minClicks,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscTrend(
        siteId,
        periods,
        dimension,
        direction,
        minClicks,
        signal,
      );
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscClassSummary(
  siteId: string | null,
  periods: GscResolvedPeriods,
  pageId: string | null = null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-class-summary",
      siteId,
      pageId,
      periodsKey(periods),
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return pageId
        ? getGscPageClassSummary(siteId, pageId, periods, signal)
        : getGscClassSummary(siteId, periods, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/**
 * C6/P28 — Class · Score · Level for a set of RAW QUERY STRINGS, keyed by
 * normalized phrase. Surfaces that only have GSC query text (no `keyword_id`
 * on the row — the `search_performance_daily` readers on the page workspace
 * and the reports dashboard) still resolve through the ONE stamp resolver
 * (`gsc_keyword_value_for`), not a re-derived local class. Two RPC round
 * trips, not two data paths: `gsc_keyword_class_by_text` only resolves TEXT
 * to `keyword_id` (there is no by-text stamp RPC), then every stamp — Class,
 * Score, Level, the receipt — comes from the same resolver every other
 * keyword table on the platform uses.
 */
export function useGscKeywordValueByText(
  siteId: string | null,
  queries: readonly string[],
) {
  const queryKey = [...queries].sort().join("\u0000");
  const ids = useQuery({
    queryKey: ["marketing", "gsc", "keyword-ids-by-text", siteId, queryKey],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscKeywordClassesByText(siteId, queries, signal);
    },
    enabled: !!siteId && queries.length > 0,
    staleTime: STALE_MS,
  });

  const keywordIds = (ids.data ?? []).map((row) => row.keyword_id);
  const idsKey = [...keywordIds].sort().join("\u0000");

  const values = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-by-text", siteId, idsKey],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscKeywordValueFor(siteId, keywordIds, signal);
    },
    enabled: !!siteId && keywordIds.length > 0,
    staleTime: STALE_MS,
  });

  const byQuery = new Map<string, GscKeywordValueRow>();
  for (const row of ids.data ?? []) {
    const value = values.data?.get(row.keyword_id);
    if (value) byQuery.set(normalizeKeywordPhrase(row.query), value);
  }

  return {
    data: byQuery,
    /** The raw text→id resolution, for a caller that also needs it verbatim. */
    ids: ids.data,
    isLoading: ids.isLoading || values.isLoading,
    isError: ids.isError || values.isError,
    error: ids.error ?? values.error,
  };
}

export function useGscClassMovers(
  siteId: string | null,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  trafficClass: GscTrafficClass | null,
  direction: "gain" | "loss",
  /** C6 — narrow to one or more value levels (`seo.keyword_value_map` slugs). */
  levels: readonly string[] = [],
  options: { enabled?: boolean } = {},
) {
  const levelKey = [...levels].sort().join("|");
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-class-movers",
      siteId,
      periodsKey(periods),
      dimension,
      trafficClass,
      direction,
      levelKey,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscClassMovers(
        siteId,
        periods,
        dimension,
        trafficClass,
        direction,
        levels,
        signal,
      );
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscShifts(
  siteId: string | null,
  periods: GscResolvedPeriods,
  minClicks: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-shifts",
      siteId,
      periodsKey(periods),
      minClicks,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscShifts(siteId, periods, minClicks, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscJuice(
  siteId: string | null,
  monthMinClicks: number,
  minMonths: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-juice",
      siteId,
      monthMinClicks,
      minMonths,
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscJuice(siteId, monthMinClicks, minMonths, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscFreshness(
  siteId: string | null,
  options: { refetchIntervalMs?: number | false } = {},
) {
  return useQuery({
    queryKey: ["marketing", "gsc", "freshness", siteId],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscFreshness(siteId, signal);
    },
    enabled: !!siteId,
    staleTime: STALE_MS,
    // While a history import runs, coverage genuinely changes minute to
    // minute — poll so the banner's "history begins" date moves live.
    refetchInterval: options.refetchIntervalMs ?? false,
  });
}

/** Server truth for "is a history import running right now?" — polls while
 *  one is active so the banner narrates real progress across refreshes. */
export function useGscBackfillStatus(siteId: string | null) {
  return useQuery({
    queryKey: ["marketing", "gsc", "backfill-status", siteId],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscBackfillStatus(siteId, signal);
    },
    enabled: !!siteId,
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data?.active ? 20_000 : 60_000),
  });
}
