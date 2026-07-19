"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  getHomepageScreenshot,
  listCrawlLinks,
  listCrawlSnapshots,
  listSiteLinks,
  listSiteScreenshots,
} from "@/features/marketing/data/inspection-queries";
import { marketingKeys } from "@/features/marketing/data/hooks";

const inspectionKeys = {
  homepageScreenshot: (siteId: string, screenshotId: string) =>
    [
      ...marketingKeys.site(siteId),
      "homepage-screenshot",
      screenshotId,
    ] as const,
  siteLinks: (siteId: string, state: MatrxDataTableQueryState) =>
    [...marketingKeys.site(siteId), "inspection-links", state] as const,
  siteScreenshots: (siteId: string, state: MatrxDataTableQueryState) =>
    [...marketingKeys.site(siteId), "inspection-screenshots", state] as const,
  crawlSnapshots: (
    siteId: string,
    crawlId: string,
    state: MatrxDataTableQueryState,
  ) =>
    [
      ...marketingKeys.crawl(siteId, crawlId),
      "inspection-snapshots",
      state,
    ] as const,
  crawlLinks: (
    siteId: string,
    crawlId: string,
    state: MatrxDataTableQueryState,
  ) =>
    [
      ...marketingKeys.crawl(siteId, crawlId),
      "inspection-links",
      state,
    ] as const,
};

/** Direct browser-to-Supabase query for the site's selected homepage preview. */
export function useHomepageScreenshot(
  siteId: string,
  screenshotId: string | null,
) {
  return useQuery({
    queryKey: inspectionKeys.homepageScreenshot(
      siteId,
      screenshotId ?? "pending",
    ),
    queryFn: ({ signal }) =>
      getHomepageScreenshot(siteId, screenshotId as string, signal),
    enabled: Boolean(siteId && screenshotId),
  });
}

/** Direct browser-to-Supabase query for a site's link graph. */
export function useSiteLinks(
  siteId: string,
  state: MatrxDataTableQueryState,
  enabled = true,
) {
  return useQuery({
    queryKey: inspectionKeys.siteLinks(siteId, state),
    queryFn: ({ signal }) => listSiteLinks(siteId, state, signal),
    enabled: enabled && Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

/** Direct browser-to-Supabase query for a site's screenshot gallery. */
export function useSiteScreenshots(
  siteId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: inspectionKeys.siteScreenshots(siteId, state),
    queryFn: ({ signal }) => listSiteScreenshots(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

/** Direct browser-to-Supabase query for one crawl's page captures. */
export function useCrawlSnapshots(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: inspectionKeys.crawlSnapshots(siteId, crawlId, state),
    queryFn: ({ signal }) => listCrawlSnapshots(siteId, crawlId, state, signal),
    enabled: Boolean(siteId && crawlId),
    placeholderData: keepPreviousData,
  });
}

/** Direct browser-to-Supabase query for one crawl's link edges. */
export function useCrawlLinks(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
  enabled = true,
) {
  return useQuery({
    queryKey: inspectionKeys.crawlLinks(siteId, crawlId, state),
    queryFn: ({ signal }) => listCrawlLinks(siteId, crawlId, state, signal),
    enabled: enabled && Boolean(siteId && crawlId),
    placeholderData: keepPreviousData,
  });
}
