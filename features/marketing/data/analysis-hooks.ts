"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  getFindingDetail,
  getSiteAnalysisOverview,
  listFindingResults,
  listPageBlockedChecks,
  listPageOpenFindings,
  listSiteFindings,
  listSitePriorityQueue,
} from "@/features/marketing/data/analysis-service";

export const analysisKeys = {
  site: (siteId: string) => ["marketing", "site", siteId, "analysis"] as const,
  overview: (siteId: string) =>
    [...analysisKeys.site(siteId), "overview"] as const,
  priority: (siteId: string, state: MatrxDataTableQueryState) =>
    [...analysisKeys.site(siteId), "priority", state] as const,
  findings: (siteId: string, state: MatrxDataTableQueryState) =>
    [...analysisKeys.site(siteId), "findings", state] as const,
  finding: (siteId: string, findingId: string) =>
    [...analysisKeys.site(siteId), "finding", findingId] as const,
  pageOpenFindings: (siteId: string, pageId: string, limit: number) =>
    [...analysisKeys.site(siteId), "page-open-findings", pageId, limit] as const,
  pageBlockedChecks: (siteId: string, pageId: string) =>
    [...analysisKeys.site(siteId), "page-blocked-checks", pageId] as const,
  results: (
    siteId: string,
    findingId: string,
    state: MatrxDataTableQueryState,
  ) => [...analysisKeys.finding(siteId, findingId), "results", state] as const,
};

export function useSiteAnalysisOverview(siteId: string) {
  return useQuery({
    queryKey: analysisKeys.overview(siteId),
    queryFn: ({ signal }) => getSiteAnalysisOverview(siteId, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useSitePriorityQueue(
  siteId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: analysisKeys.priority(siteId, state),
    queryFn: ({ signal }) => listSitePriorityQueue(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useSiteFindings(
  siteId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: analysisKeys.findings(siteId, state),
    queryFn: ({ signal }) => listSiteFindings(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

/** Open/reopened unsuppressed findings for one page (workspace-count scope). */
export function usePageOpenFindings(
  siteId: string,
  pageId: string,
  limit: number,
) {
  return useQuery({
    queryKey: analysisKeys.pageOpenFindings(siteId, pageId, limit),
    queryFn: ({ signal }) => listPageOpenFindings(siteId, pageId, limit, signal),
    enabled: Boolean(siteId && pageId),
  });
}

/** The checks blocked on missing evidence for one page, each with its fix. */
export function usePageBlockedChecks(siteId: string, pageId: string) {
  return useQuery({
    queryKey: analysisKeys.pageBlockedChecks(siteId, pageId),
    queryFn: ({ signal }) => listPageBlockedChecks(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}

export function useFindingDetail(siteId: string, findingId: string) {
  return useQuery({
    queryKey: analysisKeys.finding(siteId, findingId),
    queryFn: ({ signal }) => getFindingDetail(siteId, findingId, signal),
    enabled: Boolean(siteId && findingId),
  });
}

export function useFindingResults(
  siteId: string,
  findingId: string,
  state: MatrxDataTableQueryState,
) {
  const detail = useFindingDetail(siteId, findingId);
  const finding = detail.data?.finding;
  const results = useQuery({
    queryKey: analysisKeys.results(siteId, findingId, state),
    queryFn: ({ signal }) => {
      if (!finding) throw new Error("Finding detail is not loaded.");
      return listFindingResults(finding, state, signal);
    },
    enabled: Boolean(finding),
    placeholderData: keepPreviousData,
  });
  return { detail, results };
}
