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
  getGscCtrGap,
  getGscJuice,
  getGscShifts,
  getGscTrend,
} from "@/features/marketing/search-console/data-insights";
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
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "insight-class-summary",
      siteId,
      periodsKey(periods),
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscClassSummary(siteId, periods, signal);
    },
    enabled: !!siteId && (options.enabled ?? true),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useGscClassMovers(
  siteId: string | null,
  periods: GscResolvedPeriods,
  dimension: "query" | "page",
  trafficClass: GscTrafficClass | null,
  direction: "gain" | "loss",
  options: { enabled?: boolean } = {},
) {
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
    ],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscClassMovers(
        siteId,
        periods,
        dimension,
        trafficClass,
        direction,
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
