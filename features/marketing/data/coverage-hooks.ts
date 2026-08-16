import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  COVERAGE_WINDOW_DAYS,
  getCoverageRollup,
  listCoverageMentions,
  listCoverageTrackers,
  type CoverageFilters,
} from "@/features/marketing/data/coverage-queries";

export const coverageKeys = {
  all: ["marketing", "coverage"] as const,
  trackers: (siteId: string) =>
    [...coverageKeys.all, "trackers", siteId] as const,
  mentions: (
    siteId: string,
    state: MatrxDataTableQueryState,
    filters: CoverageFilters,
  ) => [...coverageKeys.all, "mentions", siteId, state, filters] as const,
  rollup: (siteId: string, brandKey: string, filters: CoverageFilters) =>
    [...coverageKeys.all, "rollup", siteId, brandKey, filters] as const,
};

export function useCoverageTrackers(siteId: string) {
  return useQuery({
    queryKey: coverageKeys.trackers(siteId),
    queryFn: ({ signal }) => listCoverageTrackers(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useCoverageMentions(
  siteId: string,
  state: MatrxDataTableQueryState,
  filters: CoverageFilters = {},
) {
  return useQuery({
    queryKey: coverageKeys.mentions(siteId, state, filters),
    queryFn: ({ signal }) =>
      listCoverageMentions(siteId, state, filters, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

/** The KPI band and the share-of-voice bar, from ONE fetch of the same rows. */
export function useCoverageRollup(
  siteId: string,
  brandKey: string,
  filters: CoverageFilters = { windowDays: COVERAGE_WINDOW_DAYS },
) {
  return useQuery({
    queryKey: coverageKeys.rollup(siteId, brandKey, filters),
    queryFn: ({ signal }) =>
      getCoverageRollup(siteId, brandKey, filters, signal),
    enabled: Boolean(siteId && brandKey),
  });
}
