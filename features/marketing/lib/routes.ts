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

/** The brand asset desk's four views, in display order. */
export const MARKETING_BRAND_ASSETS_VIEWS = [
  { id: "library", label: "Library" },
  { id: "research", label: "Research" },
  { id: "sources", label: "Sources" },
  { id: "generate", label: "Generate" },
] as const;

export type MarketingBrandAssetsView =
  (typeof MARKETING_BRAND_ASSETS_VIEWS)[number]["id"];

export function isMarketingBrandAssetsView(
  value: string | null | undefined,
): value is MarketingBrandAssetsView {
  return MARKETING_BRAND_ASSETS_VIEWS.some((view) => view.id === value);
}

export type MarketingSiteSettingsView =
  | "site"
  | "integrations"
  | "access-users"
  | "access-organizations"
  | "access-public"
  | "intake";

export function marketingSiteSettingsHref(
  sitePath: string,
  view: MarketingSiteSettingsView = "site",
): string {
  const base = `${sitePath}/settings`;
  return view === "site" ? base : `${base}?view=${view}`;
}

export const marketingRoutes = {
  home: () => "/marketing",
  brands: () => "/marketing/brands",
  /** Content-plan LIST page (was the root-level `/content-plan`, moved 2026-07-25; list+workspace split 2026-07-28). */
  contentPlan: () => "/marketing/content-plan",
  /** One site's plan workspace. `view` = tree (default) | table | map | entities | setup. */
  contentPlanSite: (siteId: string, view?: string) =>
    `/marketing/content-plan/${siteId}${view && view !== "tree" ? `?view=${view}` : ""}`,
  /** Keyword research workbench (was `/seo/keyword-research`, moved 2026-07-25). */
  keywordResearch: () => "/marketing/keyword-research",
  /** Public-video discovery and expertise comparison through YouTube Data API v3. */
  youtubeDiscovery: () => "/marketing/discovery/youtube",
  youtubeVideo: (videoId: string) =>
    `/marketing/discovery/youtube/videos/${encodeURIComponent(videoId)}`,
  /** The Search Console data dashboard (cross-site landing + `?site=` deep view). */
  searchConsole: (siteId?: string) =>
    siteId
      ? `/marketing/search-console?site=${siteId}`
      : "/marketing/search-console",
  /** In-app index of the PUBLIC SEO utilities (they live under `/seo/*`). */
  tools: () => "/marketing/tools",
  /** Marketing cost — provider spend against the org's monthly ceilings. */
  cost: () => "/marketing/cost",
  /** Shared catalogue of Marketing's SEO measurement capabilities. */
  capabilities: (siteId?: string) =>
    siteId
      ? `/marketing/capabilities?site=${encodeURIComponent(siteId)}`
      : "/marketing/capabilities",

  // ── Reserved routes ────────────────────────────────────────────────────
  // These render <MarketingComingSoon> today. They are REAL routes, declared
  // here and in `marketing-nav.ts` with a `marketing.*` id in
  // `lib/coming-soon/registry.ts`, so the intended shape of the platform is
  // visible to users and to the next agent. When one ships, delete its
  // registry row and drop `status: "coming-soon"` from its nav entry — the
  // href never changes.
  initiatives: () => "/marketing/initiatives",
  calendar: () => "/marketing/calendar",
  audience: () => "/marketing/audience",
  local: () => "/marketing/local",
  ranks: () => "/marketing/ranks",
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
  /** Brand-wide review inbox for discovered assets, properties, and facts. */
  brandDiscovery: (brandId: string) => `/marketing/brands/${brandId}/discovery`,
  /**
   * The brand's asset desk — Library, Research, Sources, Generate.
   *
   * These four views used to live in the WEBSITE's Media section, where they
   * were a lie: all four read brand- or org-scoped data, so two sites under
   * one brand rendered the same rows and editing "this site's library" edited
   * everything under the brand (Arman's ruling, 2026-08-15). The website keeps
   * what is genuinely its own — Crawled, Videos, Standards.
   *
   * `brief` seeds the Generate view's order, which is how the site's crawled
   * inventory hands a replacement order across the level boundary.
   */
  brandAssets: (
    brandId: string,
    view: MarketingBrandAssetsView = "library",
    brief?: string,
  ) => {
    const base = `/marketing/brands/${brandId}/assets`;
    const params = new URLSearchParams();
    if (view !== "library") params.set("view", view);
    if (brief?.trim()) params.set("brief", brief.trim());
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  },
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
  /** One configuration destination with durable, linkable Settings views. */
  siteSettings: (
    brandId: string | null | undefined,
    siteId: string,
    view: MarketingSiteSettingsView = "site",
  ) => {
    const sitePath = marketingRoutes.site(brandId, siteId);
    return marketingSiteSettingsHref(sitePath, view);
  },
  /** Site-wide internal authority flow: backlinks → crawl graph → priority pages. */
  siteAuthority: (brandId: string | null | undefined, siteId: string) =>
    brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}/authority`
      : `/marketing/sites/${siteId}/authority`,
  /**
   * One canonical page's workspace. THE DOOR LAW's most-linked marketing
   * destination: every surface that resolves a `page_id` (GSC breakdowns, dig
   * results, insights, the watchlist, crawl ledgers, cost rollups) reaches the
   * page through this ONE builder. `brandId` is optional because those rows
   * usually carry only `site_id` — the `/marketing/sites/[siteId]/[...rest]`
   * shim resolves the brand and replaces the URL with the nested canonical one.
   */
  sitePage: (
    brandId: string | null | undefined,
    siteId: string,
    pageId: string,
  ) =>
    brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}/pages/${pageId}`
      : `/marketing/sites/${siteId}/pages/${pageId}`,
  /** Theory-backed intervention ledger for one site. */
  siteChanges: (
    brandId: string | null | undefined,
    siteId: string,
    changeId?: string,
  ) => {
    const base = brandId
      ? `/marketing/brands/${brandId}/sites/${siteId}/changes`
      : `/marketing/sites/${siteId}/changes`;
    return changeId ? `${base}?change=${encodeURIComponent(changeId)}` : base;
  },
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
