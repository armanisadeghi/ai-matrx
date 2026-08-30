/**
 * Canonical Marketing route builders — the AGENCY-MODEL tree (2026-08-28).
 *
 * Two planes (design: docs/handoffs/marketing-agency-restructure.md):
 *
 *   AGENCY (small by design — only what concerns no single client)
 *     /marketing                       — agency home / hub
 *     /marketing/brands                — client roster (+ /brands/new-website)
 *     /marketing/reports               — cross-client roll-ups (+ /cost, /ranks)
 *     /marketing/operations/…          — connections, automations, approvals, data-quality
 *     /marketing/tools/…               — public analyzers index, YouTube research
 *
 *   CLIENT — everything else, nested under the brand
 *     /marketing/[brandKey]                    — brand dashboard
 *     /marketing/[brandKey]/identity/…         — the brand home (media, …)
 *     /marketing/[brandKey]/websites/[siteKey]/… — website INVENTORY (pages,
 *         structure, sitemaps, media, crawls, settings)
 *     /marketing/[brandKey]/seo/[siteKey]/…    — the SEO PRACTICE on one site
 *         (keywords, rankings, search-console, audit, findings, analysis,
 *         coverage, performance, changes, backlinks, links, authority,
 *         valuation, ai-visibility, growth-loop, automations, capabilities)
 *     /marketing/[brandKey]/{locations,content,socials,ads,email,pr,
 *         intelligence,analytics,planning,inbox,settings}
 *
 * Segments are DUAL-MODE (key or UUID — see lib/keys.ts); builders accept
 * either and the server layouts 308 UUID addresses to the key address. Never
 * hand-build a `/marketing/...` entity path — use these builders so the
 * hierarchy can't drift per call site.
 *
 * Legacy shapes (`/marketing/brands/[brandId]/…`, `/marketing/sites/[siteId]/…`
 * and the old flat pillars) are REDIRECT SHIMS, kept so pre-restructure links
 * keep landing; builders that lack the context to emit a canonical address
 * fall back to a shim path that resolves it server/client-side.
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

/** Settings tabs are ROUTES now (tabs-law); access keeps its audience as a view. */
const SITE_SETTINGS_PATHS: Record<MarketingSiteSettingsView, string> = {
  site: "",
  integrations: "/integrations",
  intake: "/intake",
  "access-users": "/access?view=users",
  "access-organizations": "/access?view=organizations",
  "access-public": "/access?view=public",
};

export function marketingSiteSettingsHref(
  sitePath: string,
  view: MarketingSiteSettingsView = "site",
): string {
  return `${sitePath}/settings${SITE_SETTINGS_PATHS[view]}`;
}

/**
 * Where each pre-restructure site section lives now. `websites` = inventory,
 * `seo` = practice. Old slug → { branch, slug } (empty slug = branch root).
 * Consumed by `site()` (so old call sites emit new URLs) and by the legacy
 * shims that translate stored/bookmarked old addresses.
 */
export const MARKETING_SITE_SECTION_HOMES: Record<
  string,
  { branch: "websites" | "seo"; slug: string }
> = {
  "": { branch: "websites", slug: "" },
  pages: { branch: "websites", slug: "pages" },
  structure: { branch: "websites", slug: "structure" },
  sitemaps: { branch: "websites", slug: "sitemaps" },
  media: { branch: "websites", slug: "media" },
  crawls: { branch: "websites", slug: "crawls" },
  settings: { branch: "websites", slug: "settings" },
  keywords: { branch: "seo", slug: "keywords" },
  value: { branch: "seo", slug: "keywords/value" },
  ranks: { branch: "seo", slug: "rankings" },
  "ai-visibility": { branch: "seo", slug: "ai-visibility" },
  audit: { branch: "seo", slug: "audit" },
  findings: { branch: "seo", slug: "findings" },
  analysis: { branch: "seo", slug: "analysis" },
  coverage: { branch: "seo", slug: "coverage" },
  performance: { branch: "seo", slug: "performance" },
  changes: { branch: "seo", slug: "changes" },
  backlinks: { branch: "seo", slug: "backlinks" },
  links: { branch: "seo", slug: "links" },
  authority: { branch: "seo", slug: "authority" },
  "growth-loop": { branch: "seo", slug: "growth-loop" },
  automations: { branch: "seo", slug: "automations" },
};

/**
 * Business-knowledge screens moved OUT of the keyword-value ladder and into
 * the brand home (identity owns business truth; valuation consumes it).
 * Old `value/<x>` → `identity/<y>` on the brand, carrying `?site=` selection.
 */
const VALUE_TO_IDENTITY: Record<string, string> = {
  discovery: "knowledge",
  offerings: "offerings",
  topics: "offerings",
  guidelines: "guidelines",
};

/** Split "/keywords/value/rules?x=1" → old section slug + remainder + query. */
function mapLegacySiteSub(brandSeg: string, siteSeg: string, sub: string): string {
  const [path, query = ""] = sub.split("?");
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  if (first === "value" && segments[1] && VALUE_TO_IDENTITY[segments[1]]) {
    const params = new URLSearchParams(query);
    params.set("site", siteSeg);
    return `/marketing/${brandSeg}/identity/${VALUE_TO_IDENTITY[segments[1]]}?${params.toString()}`;
  }
  // "value/rules" maps via the section table; everything after rides along.
  const home = MARKETING_SITE_SECTION_HOMES[first];
  const rest = segments.slice(1).join("/");
  const suffix = query ? `?${query}` : "";
  if (!home) {
    // Unknown section: keep it under the inventory branch so nothing 404s.
    return `/marketing/${brandSeg}/websites/${siteSeg}${path ? `/${path}` : ""}${suffix}`;
  }
  const mapped = [home.slug, rest].filter(Boolean).join("/");
  const base = `/marketing/${brandSeg}/${home.branch}/${siteSeg}`;
  return `${mapped ? `${base}/${mapped}` : base}${suffix}`;
}

export const marketingRoutes = {
  // ── Agency plane ───────────────────────────────────────────────────────
  home: () => "/marketing",
  brands: () => "/marketing/brands",
  /** New-website intake (static child of /brands so it can't collide with a brand key). */
  newSite: (brandId?: string) =>
    brandId
      ? `/marketing/brands/new-website?brand=${brandId}`
      : "/marketing/brands/new-website",
  reports: () => "/marketing/reports",
  /** Cross-client cost roll-up (was /marketing/cost). */
  cost: () => "/marketing/reports/cost",
  /** Cross-client rank roll-up (was /marketing/ranks). */
  ranksRollup: () => "/marketing/reports/ranks",
  /** Cross-client Search Console landing (site picker inside). */
  searchConsoleRollup: () => "/marketing/reports/search-console",
  /** Cross-client SEO capabilities catalogue (website selector inside). */
  capabilitiesCatalog: () => "/marketing/operations/capabilities",
  connections: () => "/marketing/operations/connections",
  connectionsGoogle: () => "/marketing/operations/connections/google",
  connectionsBing: () => "/marketing/operations/connections/bing",
  automations: () => "/marketing/operations/automations",
  approvals: () => "/marketing/operations/approvals",
  dataQuality: () => "/marketing/operations/data-quality",
  /** In-app index of the PUBLIC SEO analyzers (they live under `/seo/*`). */
  tools: () => "/marketing/tools",
  /** Public-video discovery and expertise comparison through YouTube Data API v3. */
  youtubeDiscovery: () => "/marketing/tools/youtube",
  youtubeVideo: (videoId: string) =>
    `/marketing/tools/youtube/videos/${encodeURIComponent(videoId)}`,

  // ── The client workspace ──────────────────────────────────────────────
  brand: (brandId: string) => `/marketing/${brandId}`,
  brandSection: (brandId: string, section: string) =>
    `/marketing/${brandId}/${section}`,
  /** The brand home. `view` = media | media/research | … */
  brandIdentity: (brandId: string) => `/marketing/${brandId}/identity`,
  /**
   * The brand's asset desk — Library, Research, Sources, Generate — now the
   * Identity section's media room (views are routes; library is the index).
   */
  brandAssets: (
    brandId: string,
    view: MarketingBrandAssetsView = "library",
    brief?: string,
  ) => {
    const base = `/marketing/${brandId}/identity/media`;
    const path = view === "library" ? base : `${base}/${view}`;
    const brief_ = brief?.trim();
    return brief_ ? `${path}?brief=${encodeURIComponent(brief_)}` : path;
  },
  /** Brand-wide review inbox for discovered assets, properties, and facts. */
  brandDiscovery: (brandId: string) => `/marketing/${brandId}/inbox`,
  /** Brand settings (keyword-value defaults, autonomy — the ladder's brand rung). */
  brandValueSettings: (brandId: string) => `/marketing/${brandId}/settings`,
  /** One brand's locations (Local & Listings). */
  brandLocal: (brandId: string) => `/marketing/${brandId}/locations`,
  /** One canonical location and its publisher-listing workspace. */
  brandLocation: (brandId: string, locationId: string) =>
    `/marketing/${brandId}/locations/${locationId}`,
  brandWebsites: (brandId: string) => `/marketing/${brandId}/websites`,
  brandSeo: (brandId: string) => `/marketing/${brandId}/seo`,
  brandContentPlan: (brandId: string) => `/marketing/${brandId}/content/plan`,
  brandEmail: (brandId: string) => `/marketing/${brandId}/email`,
  brandPress: (brandId: string) => `/marketing/${brandId}/pr`,
  brandAds: (brandId: string) => `/marketing/${brandId}/ads`,
  brandSocials: (brandId: string) => `/marketing/${brandId}/socials`,
  brandCompetitors: (brandId: string) =>
    `/marketing/${brandId}/intelligence/competitors`,
  brandMonitoring: (brandId: string) =>
    `/marketing/${brandId}/intelligence/monitoring`,
  brandReputation: (brandId: string, siteId?: string) =>
    siteId
      ? `/marketing/${brandId}/intelligence/reputation/${siteId}`
      : `/marketing/${brandId}/intelligence/reputation`,
  brandAnalytics: (brandId: string) => `/marketing/${brandId}/analytics`,
  brandInitiatives: (brandId: string) =>
    `/marketing/${brandId}/planning/initiatives`,

  // ── Website inventory (what the site IS) ──────────────────────────────
  website: (brandId: string, siteId: string, sub = "") =>
    `/marketing/${brandId}/websites/${siteId}${sub}`,

  // ── SEO practice on one site ──────────────────────────────────────────
  seoSite: (brandId: string, siteId: string, sub = "") =>
    `/marketing/${brandId}/seo/${siteId}${sub}`,
  siteKeywords: (brandId: string, siteId: string) =>
    `/marketing/${brandId}/seo/${siteId}/keywords`,
  siteKeywordValue: (brandId: string, siteId: string, sub = "") =>
    `/marketing/${brandId}/seo/${siteId}/keywords/value${sub}`,
  siteSearchConsole: (brandId: string, siteId: string) =>
    `/marketing/${brandId}/seo/${siteId}/search-console`,
  siteCapabilities: (brandId: string, siteId: string) =>
    `/marketing/${brandId}/seo/${siteId}/capabilities`,

  /**
   * Compatibility site base — the pre-restructure workhorse (79 call sites).
   * Splits the legacy section path across the websites/seo branches via
   * `MARKETING_SITE_SECTION_HOMES`, so every old call site emits a NEW
   * canonical URL without being touched. Falls back to the legacy flat shim
   * (`/marketing/sites/[siteId]/…`, which resolves brand + section
   * server-side) when the brand is unknown at the call site.
   */
  site: (brandId: string | null | undefined, siteId: string, sub = "") =>
    brandId
      ? mapLegacySiteSub(brandId, siteId, sub)
      : `/marketing/sites/${siteId}${sub}`,
  /** One configuration destination with durable, linkable Settings views. */
  siteSettings: (
    brandId: string | null | undefined,
    siteId: string,
    view: MarketingSiteSettingsView = "site",
  ) => {
    if (!brandId) {
      const legacy = `/marketing/sites/${siteId}`;
      return view === "site"
        ? `${legacy}/settings`
        : `${legacy}/settings?view=${view}`;
    }
    return marketingSiteSettingsHref(
      `/marketing/${brandId}/websites/${siteId}`,
      view,
    );
  },
  /** Site-wide internal authority flow: backlinks → crawl graph → priority pages. */
  siteAuthority: (brandId: string | null | undefined, siteId: string) =>
    brandId
      ? `/marketing/${brandId}/seo/${siteId}/authority`
      : `/marketing/sites/${siteId}/authority`,
  /**
   * One canonical page's workspace. THE DOOR LAW's most-linked marketing
   * destination — every surface that resolves a `page_id` reaches the page
   * through this ONE builder. `brandId` optional: rows usually carry only
   * `site_id`; the flat shim resolves the brand and replaces the URL.
   */
  sitePage: (
    brandId: string | null | undefined,
    siteId: string,
    pageId: string,
  ) =>
    brandId
      ? `/marketing/${brandId}/websites/${siteId}/pages/${pageId}`
      : `/marketing/sites/${siteId}/pages/${pageId}`,
  /** Theory-backed intervention ledger for one site. */
  siteChanges: (
    brandId: string | null | undefined,
    siteId: string,
    changeId?: string,
  ) => {
    const base = brandId
      ? `/marketing/${brandId}/seo/${siteId}/changes`
      : `/marketing/sites/${siteId}/changes`;
    return changeId ? `${base}?change=${encodeURIComponent(changeId)}` : base;
  },
  crawlReports: (
    brandId: string | null | undefined,
    siteId: string,
    crawlId: string,
  ) =>
    brandId
      ? `/marketing/${brandId}/websites/${siteId}/crawls/${crawlId}/reports`
      : `/marketing/sites/${siteId}/crawls/${crawlId}/reports`,
  crawlReport: (
    brandId: string | null | undefined,
    siteId: string,
    crawlId: string,
    reportKey: string,
  ) =>
    brandId
      ? `/marketing/${brandId}/websites/${siteId}/crawls/${crawlId}/reports/${reportKey}`
      : `/marketing/sites/${siteId}/crawls/${crawlId}/reports/${reportKey}`,

  // ── Content plan ──────────────────────────────────────────────────────
  /** Agency-level list door (legacy address; resolves per brand). */
  contentPlan: () => "/marketing/content-plan",
  /**
   * One site's plan workspace. Views are ROUTES now (tree is the index).
   * Without a brand the legacy shim (`/marketing/content-plan/[siteId]`)
   * resolves it — 18 call sites carry only siteId.
   */
  contentPlanSite: (siteId: string, view?: string) =>
    `/marketing/content-plan/${siteId}${view && view !== "tree" ? `?view=${view}` : ""}`,
  brandContentPlanSite: (brandId: string, siteId: string, view?: string) =>
    `/marketing/${brandId}/content/plan/${siteId}${view && view !== "tree" ? `/${view}` : ""}`,

  // ── Legacy shim addresses (resolve + redirect; builders keep them only
  //    where the call site lacks the context for a canonical address) ─────
  sites: () => "/marketing/sites",
  /** Cross-site Search Console door; with a site it resolves into the brand tree. */
  searchConsole: (siteId?: string) =>
    siteId
      ? `/marketing/search-console?site=${siteId}`
      : "/marketing/search-console",
  /** Shared catalogue of Marketing's SEO measurement capabilities. */
  capabilities: (siteId?: string) =>
    siteId
      ? `/marketing/capabilities?site=${encodeURIComponent(siteId)}`
      : "/marketing/capabilities",
  keywordResearch: () => "/marketing/keyword-research",
  backlinkValuation: () => "/marketing/backlink-valuation",
  press: () => "/marketing/pr",
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
  initiatives: () => "/marketing/initiatives",
  calendar: () => "/marketing/calendar",
  audience: () => "/marketing/audience",
};
