"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  countSites,
  createSite,
  getCrawl,
  getPageWorkspace,
  getSite,
  getSiteOverview,
  getSnapshot,
  listCrawlEvents,
  listCrawls,
  listCrawlUrls,
  listPages,
  listSiteOptions,
  listSites,
  listSnapshots,
  updatePageIntent,
} from "@/features/marketing/data/service";

export const marketingKeys = {
  root: ["marketing"] as const,
  sites: (state: MatrxDataTableQueryState) =>
    [...marketingKeys.root, "sites", state] as const,
  siteOptions: () => [...marketingKeys.root, "site-options"] as const,
  site: (siteId: string) => [...marketingKeys.root, "site", siteId] as const,
  overview: (siteId: string) =>
    [...marketingKeys.site(siteId), "overview"] as const,
  pages: (siteId: string, state: MatrxDataTableQueryState) =>
    [...marketingKeys.site(siteId), "pages", state] as const,
  page: (siteId: string, pageId: string) =>
    [...marketingKeys.site(siteId), "page", pageId] as const,
  snapshots: (
    siteId: string,
    pageId: string,
    state: MatrxDataTableQueryState,
  ) => [...marketingKeys.page(siteId, pageId), "snapshots", state] as const,
  snapshot: (siteId: string, pageId: string, snapshotId: string) =>
    [...marketingKeys.page(siteId, pageId), "snapshot", snapshotId] as const,
  crawls: (siteId: string, state: MatrxDataTableQueryState) =>
    [...marketingKeys.site(siteId), "crawls", state] as const,
  crawl: (siteId: string, crawlId: string) =>
    [...marketingKeys.site(siteId), "crawl", crawlId] as const,
  crawlUrls: (
    siteId: string,
    crawlId: string,
    state: MatrxDataTableQueryState,
  ) => [...marketingKeys.crawl(siteId, crawlId), "urls", state] as const,
  crawlEvents: (
    siteId: string,
    crawlId: string,
    state: MatrxDataTableQueryState,
  ) => [...marketingKeys.crawl(siteId, crawlId), "events", state] as const,
};

export function useSites(state: MatrxDataTableQueryState) {
  return useQuery({
    queryKey: marketingKeys.sites(state),
    queryFn: ({ signal }) => listSites(state, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSiteCount() {
  return useQuery({
    queryKey: [...marketingKeys.root, "site-count"],
    queryFn: ({ signal }) => countSites(signal),
    staleTime: 30_000,
  });
}

export function useSiteOptions() {
  return useQuery({
    queryKey: marketingKeys.siteOptions(),
    queryFn: ({ signal }) => listSiteOptions(signal),
    staleTime: 60_000,
  });
}

export function useSite(siteId: string) {
  return useQuery({
    queryKey: marketingKeys.site(siteId),
    queryFn: ({ signal }) => getSite(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useSiteOverview(siteId: string) {
  return useQuery({
    queryKey: marketingKeys.overview(siteId),
    queryFn: ({ signal }) => getSiteOverview(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
    },
  });
}

export function usePages(siteId: string, state: MatrxDataTableQueryState) {
  return useQuery({
    queryKey: marketingKeys.pages(siteId, state),
    queryFn: ({ signal }) => listPages(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function usePageWorkspace(siteId: string, pageId: string) {
  return useQuery({
    queryKey: marketingKeys.page(siteId, pageId),
    queryFn: ({ signal }) => getPageWorkspace(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}

export function useUpdatePageIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePageIntent,
    onSuccess: (page) => {
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.page(page.site_id, page.id),
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(page.site_id), "pages"],
      });
    },
  });
}

export function useSnapshots(
  siteId: string,
  pageId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: marketingKeys.snapshots(siteId, pageId, state),
    queryFn: ({ signal }) => listSnapshots(siteId, pageId, state, signal),
    enabled: Boolean(siteId && pageId),
    placeholderData: keepPreviousData,
  });
}

export function useSnapshot(
  siteId: string,
  pageId: string,
  snapshotId: string,
) {
  return useQuery({
    queryKey: marketingKeys.snapshot(siteId, pageId, snapshotId),
    queryFn: ({ signal }) => getSnapshot(siteId, pageId, snapshotId, signal),
    enabled: Boolean(siteId && pageId && snapshotId),
  });
}

export function useCrawls(siteId: string, state: MatrxDataTableQueryState) {
  return useQuery({
    queryKey: marketingKeys.crawls(siteId, state),
    queryFn: ({ signal }) => listCrawls(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useCrawl(siteId: string, crawlId: string) {
  return useQuery({
    queryKey: marketingKeys.crawl(siteId, crawlId),
    queryFn: ({ signal }) => getCrawl(siteId, crawlId, signal),
    enabled: Boolean(siteId && crawlId),
  });
}

export function useCrawlUrls(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: marketingKeys.crawlUrls(siteId, crawlId, state),
    queryFn: ({ signal }) => listCrawlUrls(siteId, crawlId, state, signal),
    enabled: Boolean(siteId && crawlId),
    placeholderData: keepPreviousData,
  });
}

export function useCrawlEvents(
  siteId: string,
  crawlId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: marketingKeys.crawlEvents(siteId, crawlId, state),
    queryFn: ({ signal }) => listCrawlEvents(siteId, crawlId, state, signal),
    enabled: Boolean(siteId && crawlId),
    placeholderData: keepPreviousData,
  });
}
