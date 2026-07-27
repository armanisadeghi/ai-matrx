/**
 * Canonical Marketing route builders. The URL hierarchy is brand-first:
 *
 *   /marketing/brands                         — brand portfolio (anchor list)
 *   /marketing/brands/[brandId]               — brand cockpit
 *   /marketing/brands/[brandId]/sites/[siteId]/...   — website property verticals
 *   /marketing/brands/[brandId]/socials/...   — (future) social properties
 *   /marketing/sites                          — flattened all-sites view
 *   /marketing/sites/[siteId]/...             — LEGACY; server-redirects to the
 *                                               nested canonical URL
 *
 * Never hand-build a `/marketing/...` entity path — use these builders so the
 * hierarchy can't drift per call site.
 */

export const marketingRoutes = {
  home: () => "/marketing",
  brands: () => "/marketing/brands",
  /** Editorial plan tree (was the root-level `/content-plan`, moved 2026-07-25). */
  contentPlan: () => "/marketing/content-plan",
  /** Keyword research workbench (was `/seo/keyword-research`, moved 2026-07-25). */
  keywordResearch: () => "/marketing/keyword-research",
  /** Public-video discovery and expertise comparison through YouTube Data API v3. */
  youtubeDiscovery: () => "/marketing/discovery/youtube",
  youtubeVideo: (videoId: string) =>
    `/marketing/discovery/youtube/videos/${encodeURIComponent(videoId)}`,
  /** In-app index of the PUBLIC SEO utilities (they live under `/seo/*`). */
  tools: () => "/marketing/tools",
  batches: () => "/marketing/batches",
  cost: () => "/marketing/cost",

  // ── Reserved routes ────────────────────────────────────────────────────
  // These render <MarketingComingSoon> today. They are REAL routes, declared
  // here and in `marketing-nav.ts` with a `marketing.*` id in
  // `lib/coming-soon/registry.ts`, so the intended shape of the platform is
  // visible to users and to the next agent. When one ships, delete its
  // registry row and drop `status: "coming-soon"` from its nav entry — the
  // href never changes.
  campaigns: () => "/marketing/campaigns",
  calendar: () => "/marketing/calendar",
  audience: () => "/marketing/audience",
  local: () => "/marketing/local",
  ranks: () => "/marketing/ranks",
  aiVisibility: () => "/marketing/ai-visibility",
  contentStudio: () => "/marketing/content-studio",
  social: () => "/marketing/social",
  email: () => "/marketing/email",
  ads: () => "/marketing/ads",
  outreach: () => "/marketing/outreach",
  competitors: () => "/marketing/competitors",
  monitoring: () => "/marketing/monitoring",
  analytics: () => "/marketing/analytics",
  reports: () => "/marketing/reports",
  automations: () => "/marketing/automations",
  brand: (brandId: string) => `/marketing/brands/${brandId}`,
  sites: () => "/marketing/sites",
  /** Pass a brandId to pre-bind the new site to that brand (`?brand=`). */
  newSite: (brandId?: string) =>
    brandId ? `/marketing/sites/new?brand=${brandId}` : "/marketing/sites/new",
  connections: () => "/marketing/connections",
  connectionsGoogle: () => "/marketing/connections/google",
  connectionsBing: () => "/marketing/connections/bing",
  /**
   * Canonical site base. Falls back to the legacy flat path (which
   * server-redirects to the nested one) when the brand id is unknown at the
   * call site — e.g. cross-links built from rows that only carry site_id.
   */
  site: (brandId: string | null | undefined, siteId: string, sub = "") =>
    brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}${sub}`
      : `/marketing/sites/${siteId}${sub}`,
  crawlReports: (
    brandId: string | null | undefined,
    siteId: string,
    crawlId: string,
  ) =>
    brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}/crawls/${crawlId}/reports`
      : `/marketing/sites/${siteId}/crawls/${crawlId}/reports`,
  crawlReport: (
    brandId: string | null | undefined,
    siteId: string,
    crawlId: string,
    reportKey: string,
  ) =>
    brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}/crawls/${crawlId}/reports/${reportKey}`
      : `/marketing/sites/${siteId}/crawls/${crawlId}/reports/${reportKey}`,
};
