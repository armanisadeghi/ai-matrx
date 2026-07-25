"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  confirmDiscoveredAsset,
  confirmDiscoveredProperty,
  getBrand,
  listBrands,
  listBrandAssets,
  listBrandProperties,
  listBrandSites,
  listBusinessFacts,
  getSitemap,
  getSitemapCoverage,
  listSitemapPages,
  listSitemaps,
  confirmDiscoveredFact,
  countPendingDiscovered,
  countSites,
  createBrand,
  createBrandAsset,
  createBusinessFact,
  createManualPage,
  createProperty,
  createSite,
  deleteBrand,
  deleteBrandAsset,
  deleteBusinessFact,
  deleteCrawlSession,
  deleteDiscoveredItem,
  deletePage,
  deleteProperty,
  deleteScreenshot,
  deleteSite,
  deleteSitemap,
  dismissDiscoveredItem,
  getActiveCrawl,
  getCoverageMatrix,
  getCrawl,
  getHomepageObservedMeta,
  getPageWorkspace,
  getSite,
  getSiteHeroScreenshot,
  getSiteOverview,
  getSnapshot,
  listCrawlEvents,
  listCrawls,
  listCrawlUrls,
  listRecentLiveCrawlEvents,
  listDiscoveredItems,
  listPages,
  listPageScreenshots,
  listPageSitemapMemberships,
  listSiteOptions,
  listSites,
  listBrandOptions,
  listSnapshots,
  moveSiteBrand,
  setSitemapActive,
  undismissDiscoveredItem,
  updateBrand,
  updateBrandAsset,
  updateBusinessFact,
  fetchSiteAuditRows,
  fetchSiteAuditTrendRows,
  updatePageIntent,
  updateProperty,
  updateSiteIdentity,
} from "@/features/marketing/data/service";
import { listPagePerformance } from "@/features/marketing/pagespeed/data";
import { listWebAnalyticsDailyForPage } from "@/features/marketing/analytics/data";
import {
  buildSiteAuditRollup,
  buildSiteAuditTrend,
  type SiteAuditRollup,
} from "@/features/marketing/lib/audit-rollup";
import type {
  PageCoverageFilter,
  SitemapPagesFilter,
} from "@/features/marketing/data/service";
import type { DiscoveredItemStatus } from "@/features/marketing/types";

export const marketingKeys = {
  root: ["marketing"] as const,
  sites: (state: MatrxDataTableQueryState) =>
    [...marketingKeys.root, "sites", state] as const,
  siteOptions: () => [...marketingKeys.root, "site-options"] as const,
  site: (siteId: string) => [...marketingKeys.root, "site", siteId] as const,
  overview: (siteId: string) =>
    [...marketingKeys.site(siteId), "overview"] as const,
  auditRollup: (siteId: string) =>
    [...marketingKeys.site(siteId), "audit-rollup"] as const,
  auditTrend: (siteId: string) =>
    [...marketingKeys.site(siteId), "audit-trend"] as const,
  homepageMeta: (siteId: string) =>
    [...marketingKeys.site(siteId), "homepage-meta"] as const,
  heroScreenshot: (siteId: string) =>
    [...marketingKeys.site(siteId), "hero-screenshot"] as const,
  discovered: (brandId: string, status: DiscoveredItemStatus | null) =>
    [...marketingKeys.root, "brand", brandId, "discovered", status] as const,
  discoveredCount: (brandId: string) =>
    [...marketingKeys.root, "brand", brandId, "discovered-count"] as const,
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
    [...marketingKeys.crawlSessions(siteId), state] as const,
  crawlSessions: (siteId: string) =>
    [...marketingKeys.site(siteId), "crawls"] as const,
  activeCrawl: (siteId: string) =>
    [...marketingKeys.crawlSessions(siteId), "active"] as const,
  crawl: (siteId: string, crawlId: string) =>
    [...marketingKeys.site(siteId), "crawl", crawlId] as const,
  liveCrawlEvents: (siteId: string, crawlId: string) =>
    [...marketingKeys.crawl(siteId, crawlId), "live-events"] as const,
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

export function useHomepageObservedMeta(siteId: string, rootUrl: string) {
  return useQuery({
    queryKey: [...marketingKeys.homepageMeta(siteId), rootUrl] as const,
    queryFn: ({ signal }) => getHomepageObservedMeta(siteId, rootUrl, signal),
    enabled: Boolean(siteId && rootUrl),
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

export function usePages(
  siteId: string,
  state: MatrxDataTableQueryState,
  coverage: PageCoverageFilter | null = null,
) {
  return useQuery({
    queryKey: [...marketingKeys.pages(siteId, state), coverage] as const,
    queryFn: ({ signal }) => listPages(siteId, state, coverage, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useCoverageMatrix(siteId: string) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "coverage-matrix"] as const,
    queryFn: ({ signal }) => getCoverageMatrix(siteId, signal),
    enabled: Boolean(siteId),
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

export function usePageSitemapMemberships(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "sitemaps"] as const,
    queryFn: ({ signal }) => listPageSitemapMemberships(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}

export function usePageScreenshots(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "screenshots"] as const,
    queryFn: ({ signal }) => listPageScreenshots(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}

/** Persisted PageSpeed Insights rows for one page (shared query cache — the
 * PageWorkspace surface scope and the Pagespeed card read the same rows). */
export function usePagePerformance(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "pagespeed"] as const,
    queryFn: ({ signal }) => listPagePerformance(pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}

/** Stored GA4 landing-page rows for one page (shared query cache). */
export function usePageWebAnalytics(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "web-analytics"] as const,
    queryFn: ({ signal }) =>
      listWebAnalyticsDailyForPage(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
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

export function useActiveCrawl(siteId: string, fallbackPolling: boolean) {
  return useQuery({
    queryKey: marketingKeys.activeCrawl(siteId),
    queryFn: ({ signal }) => getActiveCrawl(siteId, signal),
    enabled: Boolean(siteId),
    refetchInterval: fallbackPolling ? 3_000 : false,
  });
}

export function useRecentLiveCrawlEvents(
  siteId: string,
  crawlId: string | null,
  fallbackPolling: boolean,
) {
  return useQuery({
    queryKey: marketingKeys.liveCrawlEvents(siteId, crawlId ?? "none"),
    queryFn: ({ signal }) => {
      if (!crawlId) {
        throw new Error("A crawl session is required to load live events.");
      }
      return listRecentLiveCrawlEvents(siteId, crawlId, signal);
    },
    enabled: Boolean(siteId && crawlId),
    refetchInterval: fallbackPolling ? 3_000 : false,
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
  enabled = true,
) {
  return useQuery({
    queryKey: marketingKeys.crawlUrls(siteId, crawlId, state),
    queryFn: ({ signal }) => listCrawlUrls(siteId, crawlId, state, signal),
    enabled: enabled && Boolean(siteId && crawlId),
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

export function useSiteHeroScreenshot(
  siteId: string,
  rootUrl: string,
  screenshotId: string | null,
) {
  return useQuery({
    queryKey: [
      ...marketingKeys.heroScreenshot(siteId),
      rootUrl,
      screenshotId ?? "unselected",
    ],
    queryFn: ({ signal }) =>
      getSiteHeroScreenshot(siteId, rootUrl, screenshotId, signal),
    enabled: Boolean(siteId && rootUrl),
  });
}

export function useUpdateSiteIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSiteIdentity,
    onSuccess: (site) => {
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "sites"],
      });
    },
  });
}

export function useDiscoveredItems(
  brandId: string | null,
  status: DiscoveredItemStatus | null,
) {
  return useQuery({
    queryKey: marketingKeys.discovered(brandId ?? "none", status),
    queryFn: ({ signal }) => listDiscoveredItems(brandId ?? "", status, signal),
    enabled: Boolean(brandId),
  });
}

export function usePendingDiscoveredCount(brandId: string | null) {
  return useQuery({
    queryKey: marketingKeys.discoveredCount(brandId ?? "none"),
    queryFn: ({ signal }) => countPendingDiscovered(brandId ?? "", signal),
    enabled: Boolean(brandId),
    staleTime: 15_000,
  });
}

function useDiscoveryMutation<TInput>(
  mutationFn: (input: TInput) => Promise<void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brand"],
      });
    },
  });
}

export function useConfirmDiscoveredAsset() {
  return useDiscoveryMutation(confirmDiscoveredAsset);
}

export function useConfirmDiscoveredProperty() {
  return useDiscoveryMutation(confirmDiscoveredProperty);
}

export function useConfirmDiscoveredFact() {
  return useDiscoveryMutation(confirmDiscoveredFact);
}

export function useDismissDiscoveredItem() {
  return useDiscoveryMutation(dismissDiscoveredItem);
}

export function useBrands(state: MatrxDataTableQueryState) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brands", state] as const,
    queryFn: ({ signal }) => listBrands(state, signal),
    placeholderData: keepPreviousData,
  });
}

export function useBrand(brandId: string) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brand", brandId, "detail"] as const,
    queryFn: ({ signal }) => getBrand(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useBrandSites(brandId: string) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brand", brandId, "sites"] as const,
    queryFn: ({ signal }) => listBrandSites(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useBrandProperties(brandId: string) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brand", brandId, "properties"] as const,
    queryFn: ({ signal }) => listBrandProperties(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useBrandAssets(brandId: string) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brand", brandId, "assets"] as const,
    queryFn: ({ signal }) => listBrandAssets(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useBusinessFacts(brandId: string) {
  return useQuery({
    queryKey: [...marketingKeys.root, "brand", brandId, "facts"] as const,
    queryFn: ({ signal }) => listBusinessFacts(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useSitemaps(siteId: string) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "sitemaps"] as const,
    queryFn: ({ signal }) => listSitemaps(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useSitemapCoverage(siteId: string) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "sitemap-coverage"] as const,
    queryFn: ({ signal }) => getSitemapCoverage(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useSitemap(siteId: string, sitemapId: string) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "sitemap", sitemapId] as const,
    queryFn: ({ signal }) => getSitemap(siteId, sitemapId, signal),
    enabled: Boolean(siteId && sitemapId),
  });
}

export function useSitemapPages(
  siteId: string,
  sitemapId: string,
  state: MatrxDataTableQueryState,
  filter: SitemapPagesFilter,
) {
  return useQuery({
    queryKey: [
      ...marketingKeys.site(siteId),
      "sitemap",
      sitemapId,
      "pages",
      state,
      filter,
    ] as const,
    queryFn: ({ signal }) =>
      listSitemapPages(siteId, sitemapId, state, filter, signal),
    enabled: Boolean(siteId && sitemapId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brands"],
      });
    },
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBrand,
    onSuccess: (brand) => {
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brands"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brand", brand.id],
      });
    },
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBrand,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brands"],
      });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSite,
    onSuccess: (_result, siteId) => {
      // Drop the deleted site's own subtree WITHOUT refetching it — an open
      // view racing this invalidation must not re-request a dead row (the
      // PGRST116 class). List keys refetch; the entity key is only removed
      // for inactive observers.
      void queryClient.removeQueries({
        queryKey: marketingKeys.site(siteId),
        type: "inactive",
      });
      for (const key of [
        [...marketingKeys.root, "sites"],
        [...marketingKeys.root, "site-count"],
        marketingKeys.siteOptions(),
        [...marketingKeys.root, "brand"],
        [...marketingKeys.root, "brands"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ============================================================================
// Full-CRUD mutations — pages, sitemaps, discovery, properties, assets,
// facts, screenshots, crawl sessions
// ============================================================================

/** Invalidate one site's subtree (pages, sitemaps, coverage, crawls, …). */
function useSiteMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  siteId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.site(siteId),
      });
    },
  });
}

export function useCreateManualPage(siteId: string) {
  return useSiteMutation(createManualPage, siteId);
}

export function useDeletePage(siteId: string) {
  return useSiteMutation(
    (pageId: string) => deletePage(siteId, pageId),
    siteId,
  );
}

export function useSetSitemapActive(siteId: string) {
  return useSiteMutation(
    (input: { sitemapId: string; isActive: boolean }) =>
      setSitemapActive(siteId, input.sitemapId, input.isActive),
    siteId,
  );
}

export function useDeleteSitemap(siteId: string) {
  return useSiteMutation(
    (sitemapId: string) => deleteSitemap(siteId, sitemapId),
    siteId,
  );
}

export function useDeleteScreenshot(siteId: string) {
  return useSiteMutation(
    (screenshotId: string) => deleteScreenshot(siteId, screenshotId),
    siteId,
  );
}

export function useDeleteCrawlSession(siteId: string) {
  return useSiteMutation(
    (crawlId: string) => deleteCrawlSession(siteId, crawlId),
    siteId,
  );
}

export function useDeleteDiscoveredItem() {
  return useDiscoveryMutation(deleteDiscoveredItem);
}

export function useUndismissDiscoveredItem() {
  return useDiscoveryMutation(undismissDiscoveredItem);
}

/** Invalidate every brand-scoped read (cockpit sections + brands list). */
function useBrandScopedMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brand"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brands"],
      });
    },
  });
}

export function useCreateProperty() {
  return useBrandScopedMutation(createProperty);
}

export function useUpdateProperty() {
  return useBrandScopedMutation(updateProperty);
}

export function useDeleteProperty() {
  return useBrandScopedMutation(deleteProperty);
}

export function useCreateBrandAsset() {
  return useBrandScopedMutation(createBrandAsset);
}

export function useUpdateBrandAsset() {
  return useBrandScopedMutation(updateBrandAsset);
}

export function useDeleteBrandAsset() {
  return useBrandScopedMutation(deleteBrandAsset);
}

/** Light brand options (id/name) for one organization — pickers only. */
export function useBrandOptions(organizationId: string | null) {
  return useQuery({
    queryKey: [
      ...marketingKeys.root,
      "brand-options",
      organizationId ?? "none",
    ] as const,
    queryFn: ({ signal }) => listBrandOptions(organizationId ?? "", signal),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });
}

/** Reassign a site to another brand; refreshes both cockpits + all lists. */
export function useMoveSiteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { siteId: string; brandId: string }) =>
      moveSiteBrand(input.siteId, input.brandId),
    onSuccess: (site) => {
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "sites"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brand"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brands"],
      });
    },
  });
}

export function useCreateBusinessFact() {
  return useBrandScopedMutation(createBusinessFact);
}

export function useUpdateBusinessFact() {
  return useBrandScopedMutation(updateBusinessFact);
}

export function useDeleteBusinessFact() {
  return useBrandScopedMutation(deleteBusinessFact);
}

/**
 * Site-wide audit rollup over stored deterministic metrics. Fetch is bounded
 * and paged (service); aggregation is pure (lib/audit-rollup.ts).
 */
export function useSiteAuditRollup(siteId: string) {
  return useQuery<SiteAuditRollup>({
    queryKey: marketingKeys.auditRollup(siteId),
    queryFn: async ({ signal }) =>
      buildSiteAuditRollup(await fetchSiteAuditRows(siteId, signal)),
    staleTime: 60_000,
  });
}

/**
 * Site audit score trend (M-55) over stored deterministic metrics across
 * EVERY historical snapshot (not just the latest per page). Aggregation is
 * pure (lib/audit-rollup.ts::buildSiteAuditTrend).
 */
export function useSiteAuditTrend(siteId: string) {
  return useQuery({
    queryKey: marketingKeys.auditTrend(siteId),
    queryFn: async ({ signal }) =>
      buildSiteAuditTrend(await fetchSiteAuditTrendRows(siteId, signal)),
    staleTime: 60_000,
  });
}
