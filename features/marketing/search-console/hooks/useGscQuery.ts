/**
 * The one hook family for Search Console reads — react-query over the
 * `seo.gsc_perf_*` RPC callers, keyed on (site, periods, filters, query) so
 * every filter chip, range change, and table page is its own cache entry.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getGscBreakdown,
  getGscFreshness,
  getGscSummary,
  getGscTimeseries,
} from "@/features/marketing/search-console/data";
import type {
  GscBreakdownQuery,
  GscFilters,
  GscResolvedPeriods,
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

export function useGscFreshness(siteId: string | null) {
  return useQuery({
    queryKey: ["marketing", "gsc", "freshness", siteId],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return getGscFreshness(siteId, signal);
    },
    enabled: !!siteId,
    staleTime: STALE_MS,
  });
}
