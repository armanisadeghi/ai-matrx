import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const MARKETING_ADMIN_MAP: FeatureAdminMap = {
  name: "Marketing",
  slug: "marketing",
  description:
    "The Marketing module in its agency-model shape (2026-08-28): a small AGENCY plane (client roster, cross-client reports, operations, generic tools) plus everything else nested inside one client at /marketing/[brandId] — identity, websites (crawler, canonical page registry, immutable snapshots), the SEO practice per site, content, channels, intelligence, planning. Structure is declared ONCE in features/marketing/lib/{routes.ts,brand-sections.ts,route-sections.ts,marketing-nav.ts}. Persisted data is read directly from Supabase by the browser.",
  docs: [
    { label: "Marketing FEATURE.md", href: "/features/marketing/FEATURE.md" },
    {
      label: "Agency-model restructure (design + remaining work)",
      href: "/docs/handoffs/marketing-agency-restructure.md",
    },
    {
      label: "Route architecture",
      href: "/docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md",
    },
    {
      label: "Implemented web schema",
      href: "/docs/WEB_SCHEMA_IMPLEMENTED_CONTRACT.md",
    },
  ],
  routeScanPath: "app/(core)/marketing",
  routes: [
    // ── Agency plane ─────────────────────────────────────────────────────
    {
      url: "/marketing",
      label: "Marketing hub",
      description:
        "List view of every Marketing pillar (MarketingHub over MARKETING_PILLARS).",
      filePath: "app/(core)/marketing/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands",
      label: "Client roster",
      description:
        "BrandsPortfolio — every client brand, and the door into each client workspace.",
      filePath: "app/(core)/marketing/brands/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/new-website",
      label: "Add website",
      description:
        "NewSiteForm — creates a site through web.create_site; `?brand=` pre-binds it to a client.",
      filePath: "app/(core)/marketing/brands/new-website/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/reports",
      label: "Client reports",
      description:
        "MarketingReportsWorkspace — printable 28-day Search Console report with findings, comparison, and traffic classes.",
      filePath: "app/(core)/marketing/reports/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/reports/cost",
      label: "Cost roll-up",
      description:
        "WorkspaceCostWorkspace — cross-site and client-organization cost rollups (was /marketing/cost).",
      filePath: "app/(core)/marketing/reports/cost/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/reports/ranks",
      label: "Rank roll-up",
      description:
        "CrossSiteRanksHub — every tracked keyword across every client and site (was /marketing/ranks).",
      filePath: "app/(core)/marketing/reports/ranks/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/connections",
      label: "Data connections",
      description:
        "MarketingConnectionsCatalog — the provider catalogue for the agency's data sources.",
      filePath: "app/(core)/marketing/operations/connections/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/connections/google",
      label: "Google connection",
      description:
        "MarketingConnectionsWorkspace — user/organization vault onboarding and managed-site Google binding.",
      filePath: "app/(core)/marketing/operations/connections/google/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/connections/google/read-only",
      label: "Google read-only sweep",
      description:
        "ReadOnlySweepWorkspace — the read-only Search Console property sweep.",
      filePath:
        "app/(core)/marketing/operations/connections/google/read-only/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/connections/bing",
      label: "Bing connection",
      description:
        "BingConnectionsWorkspace — Bing Webmaster authorization and site binding.",
      filePath: "app/(core)/marketing/operations/connections/bing/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/connections/bing/callback",
      label: "Bing OAuth callback",
      description:
        "BingOAuthCallback — did NOT move with the rest of /marketing/connections: this exact path is the redirect URI registered with Bing and held as BING_WEBMASTER_OAUTH_REDIRECT_URI.",
      filePath: "app/(core)/marketing/connections/bing/callback/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/automations",
      label: "Automations (organization tier)",
      description:
        "OrganizationRunConsoleMount — drives the keyword-coverage engines for every brand the organization controls.",
      filePath: "app/(core)/marketing/operations/automations/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/approvals",
      label: "Approvals",
      description:
        "ApprovalsConsole — every pending AI proposal in the reviewer's scope, with per-item and batch rulings.",
      filePath: "app/(core)/marketing/operations/approvals/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/operations/data-quality",
      label: "Keyword data quality",
      description:
        "KeywordDataQualityPanel — Keyword Classifier and Topic Assigner controls (was /marketing/admin/keyword-data-quality).",
      filePath: "app/(core)/marketing/operations/data-quality/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/tools",
      label: "SEO Tools index",
      description:
        "In-app index of the PUBLIC analyzers, which stay on /seo/* in the (public) route group.",
      filePath: "app/(core)/marketing/tools/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/tools/youtube",
      label: "YouTube discovery",
      description:
        "YouTubeDiscovery — public-video search and expertise comparison over the YouTube Data API.",
      filePath: "app/(core)/marketing/tools/youtube/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/tools/youtube/videos/[videoId]",
      label: "YouTube video preview",
      description:
        "YouTubeVideoPreviewPage — the durable direct-preview address for one public video.",
      filePath: "app/(core)/marketing/tools/youtube/videos/[videoId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/admin",
      label: "Feature admin map",
      description: "This inventory of the Marketing route and component surface.",
      filePath: "app/(core)/marketing/admin/page.tsx",
      status: "Live",
    },

    // ── Entity doors (id-only addresses; the registry's share targets) ────
    {
      url: "/marketing/pages/[pageId]",
      label: "Page short link",
      description:
        "Canonical page-by-id door: redirects into the nested workspace, or renders a standalone page view for a page-only grantee.",
      filePath: "app/(core)/marketing/pages/[pageId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/snapshots/[snapshotId]",
      label: "Snapshot short link",
      description:
        "Standalone captured-snapshot view (metadata, body/markdown file refs) for a snapshot-only grantee.",
      filePath: "app/(core)/marketing/snapshots/[snapshotId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/screenshots/[screenshotId]",
      label: "Screenshot short link",
      description:
        "Standalone web.screenshot view with its captured image and share control.",
      filePath: "app/(core)/marketing/screenshots/[screenshotId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/properties/[propertyId]",
      label: "Property short link",
      description:
        "Standalone web.property view — kind, handle, public URL, and status for one discovered property.",
      filePath: "app/(core)/marketing/properties/[propertyId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/changes/[changeId]",
      label: "SEO change short link",
      description:
        "Resolves a seo.change_set id to its site's Changes workspace with the row selected.",
      filePath: "app/(core)/marketing/changes/[changeId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/content-plan/nodes/[nodeId]",
      label: "Plan node short link",
      description:
        "Resolves a plan.node id to its site's Content Plan workspace with `?node=` selection.",
      filePath: "app/(core)/marketing/content-plan/nodes/[nodeId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/growth-loop/[loopRunId]",
      label: "Growth loop run short link",
      description:
        "The registry's growth_loop_run url_path_template — resolves a run to its site's Growth Loop screen.",
      filePath: "app/(core)/marketing/growth-loop/[loopRunId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/ai-visibility/runs/[runId]",
      label: "AI visibility run",
      description:
        "CollectionRunView — the standalone landing for one shared seo.collection_run, with no brand/site access required.",
      filePath: "app/(core)/marketing/ai-visibility/runs/[runId]/page.tsx",
      status: "Live",
    },

    // ── The client workspace: /marketing/[brandId] ────────────────────────
    {
      url: "/marketing/[brandId]",
      label: "Brand overview",
      description:
        "BrandWorkspace — this client at a glance: properties, health, activity. The dual-mode segment accepts a brand key or UUID.",
      filePath: "app/(core)/marketing/[brandId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity",
      label: "Brand Home",
      description:
        "Index of the brand-truth rooms — media, knowledge, offerings, guidelines, audience — each a real route.",
      filePath: "app/(core)/marketing/[brandId]/identity/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/media",
      label: "Brand media — Library",
      description:
        "BrandAssetsWorkspace (view=library) — the brand's asset desk index.",
      filePath: "app/(core)/marketing/[brandId]/identity/media/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/media/research",
      label: "Brand media — Research",
      description: "BrandAssetsWorkspace (view=research) — researched imagery.",
      filePath:
        "app/(core)/marketing/[brandId]/identity/media/research/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/media/sources",
      label: "Brand media — Sources",
      description: "BrandAssetsWorkspace (view=sources) — stock media sources.",
      filePath: "app/(core)/marketing/[brandId]/identity/media/sources/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/media/generate",
      label: "Brand media — Generate",
      description:
        "BrandAssetsWorkspace (view=generate) — the brand image generator.",
      filePath:
        "app/(core)/marketing/[brandId]/identity/media/generate/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/knowledge",
      label: "Brand knowledge",
      description:
        "DiscoveryPage in BrandIdentitySiteSurface — the Business Discovery Ladder; `?site=` picks which website is read.",
      filePath: "app/(core)/marketing/[brandId]/identity/knowledge/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/offerings",
      label: "Offering tree",
      description:
        "TopicTreeWorkbench — the user-facing name for the shared seo.topic hierarchy.",
      filePath: "app/(core)/marketing/[brandId]/identity/offerings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/guidelines",
      label: "Business guidelines",
      description:
        "GuidelinesWorkbench — how this brand must be written about; every agent inherits these rules.",
      filePath: "app/(core)/marketing/[brandId]/identity/guidelines/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/identity/audience",
      label: "Audience & Personas",
      description:
        "RESERVED — renders <MarketingComingSoon comingSoonId=\"marketing.audience\">; the URL is permanent.",
      filePath: "app/(core)/marketing/[brandId]/identity/audience/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/[brandId]/websites",
      label: "Websites",
      description:
        "SitesPortfolio — the client's Properties door (still reads the whole readable portfolio; brand scoping tracked in the restructure handoff).",
      filePath: "app/(core)/marketing/[brandId]/websites/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]",
      label: "Site overview",
      description:
        "SiteOverview — site identity, current rollups, integration status, and crawl baseline.",
      filePath: "app/(core)/marketing/[brandId]/websites/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/[...rest]",
      label: "Website-branch section mapper",
      description:
        "Cross-branch safety net: an SEO section composed on the websites base (or a renamed section) 308s to its one real home; a self-mapping path is a genuine 404.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/[...rest]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/pages",
      label: "Canonical pages",
      description:
        "PagesTable — the stable URL registry, separate from every crawl's encountered URLs.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/pages/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/pages/[pageId]",
      label: "Page workspace",
      description:
        "PageWorkspace — user-owned SEO intent plus the latest accepted observed snapshot.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/pages/[pageId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots",
      label: "Snapshot timeline",
      description:
        "SnapshotsTable — paginated immutable captures for one canonical page.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots/[snapshotId]",
      label: "Snapshot detail",
      description:
        "SnapshotDetail — captured metadata, extraction, links, images, and durable body reference.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/pages/[pageId]/snapshots/[snapshotId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/structure",
      label: "Site structure",
      description:
        "StructureWorkspace — the routing tree over the canonical page registry with per-level totals and route gaps.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/structure/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/sitemaps",
      label: "Sitemaps",
      description:
        "SitemapsWorkspace — discovered sitemap documents and their sync state.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/sitemaps/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/sitemaps/[sitemapId]",
      label: "Sitemap detail",
      description: "SitemapDetail — one sitemap document and its page membership.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/sitemaps/[sitemapId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/media",
      label: "Site media",
      description:
        "SiteMediaWorkspace — crawled images, videos, and media standards; the brand-asset `?view=` values 308 to the brand asset desk.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/media/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls",
      label: "Crawl sessions",
      description:
        "CrawlsTable — frozen crawl events with status, scope, timing, and rollup stats.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/new",
      label: "New crawl",
      description:
        "NewCrawlWorkspace — configure and launch a crawl session for this site.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/new/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]",
      label: "Crawl summary",
      description:
        "CrawlSummary — coverage and reconciliation summary for one session.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/urls",
      label: "Crawl URL ledger",
      description:
        "CrawlUrlsTable — every encountered URL and its run-specific classification and outcome.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/urls/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports",
      label: "Crawl report catalogue",
      description:
        "CrawlReportsIndex — the bulk technical-SEO report index for one crawl session.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports/[reportKey]",
      label: "Crawl report",
      description:
        "CrawlReportWorkspace — response, metadata, heading, canonical, directive, image, content, structured-data, and performance reports.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/reports/[reportKey]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/snapshots",
      label: "Crawl snapshots",
      description:
        "CrawlSnapshotsInspectionTable — immutable captures produced by one crawl session.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/snapshots/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/links",
      label: "Crawl link edges",
      description:
        "LinksInspectionTable scoped to one crawl — run-specific link graph evidence.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/links/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/logs",
      label: "Crawl events",
      description:
        "CrawlLogsTable — the durable ordered event history, separate from the transient live stream.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]/logs/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/settings",
      label: "Site settings",
      description:
        "SiteConfigurationWorkspace (view=site) — identity and crawl defaults; the other views are sibling routes.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/settings/integrations",
      label: "Site integrations",
      description:
        "SiteConfigurationWorkspace (view=integrations) — provider bindings for this site.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/settings/integrations/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/settings/access",
      label: "Site access",
      description:
        "SiteConfigurationWorkspace access views — `?view=users|organizations|public` selects the audience list.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/settings/access/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/websites/[siteId]/settings/intake",
      label: "Site intake",
      description:
        "SiteConfigurationWorkspace (view=intake) — the site's intake configuration.",
      filePath:
        "app/(core)/marketing/[brandId]/websites/[siteId]/settings/intake/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo",
      label: "SEO section",
      description:
        "The client's website list, each row opening the SEO practice on that site (entry-list doctrine, never a forced workspace).",
      filePath: "app/(core)/marketing/[brandId]/seo/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]",
      label: "SEO branch root",
      description:
        "A door, not a screen: 308s to this site's Keywords screen from the resolved brand/site rows.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/[...rest]",
      label: "SEO-branch section mapper",
      description:
        "Twin of the websites mapper: an inventory section or old section name composed on the SEO base 308s to its real home.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/[...rest]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords",
      label: "Keywords front door",
      description:
        "SiteKeywordsView — the map of every screen that gives keywords meaning; old `?view=` links still land on the screen they name.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/performance",
      label: "Keyword performance",
      description:
        "SiteKeywordsView (view=performance) — what people searched, what they clicked, where the site ranks.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/performance/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/workbench",
      label: "Keyword workbench",
      description:
        "SiteKeywordsView (view=workbench) — the assignment surface: set a keyword's class or dimension with the reason that teaches the system.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/workbench/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/research",
      label: "Keyword research",
      description:
        "KeywordResearchWorkbench — AI keyword relationship mapping plus live market data (was /marketing/keyword-research).",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/research/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/value",
      label: "Keyword Value workbench",
      description:
        "ValueWorkbench — what this site's keywords are worth and why; business-knowledge screens moved to the brand's Identity section.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/value/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/value/dimensions",
      label: "Keyword dimensions",
      description:
        "DimensionManager — where a site authors the questions its keywords are sorted by (D37).",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/value/dimensions/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/value/rules",
      label: "Value rulebook",
      description:
        "MeaningRulesWorkbench — what earns points and how much: matchers, worth, and levels.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/value/rules/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/value/packs",
      label: "Industry starter packs",
      description:
        "StarterPackCatalog — a ready set of keyword meaning to adopt and then edit.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/value/packs/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/keywords/value/settings",
      label: "Site value settings",
      description:
        "ValueSettingsEditor + AutonomyModesEditor + copy-from-site tools at the SITE rung of the ladder (KI-046).",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/keywords/value/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/rankings",
      label: "Rank tracking",
      description:
        "RanksWorkspace — keyword positions and movement for this site (was `…/sites/[siteId]/ranks`).",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/rankings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/search-console",
      label: "Search Console",
      description:
        "SearchConsoleGate — the full GSC dataset for this site; the route stamps `?site=<uuid>` and leaves the workspace's own query state alone.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/search-console/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/audit",
      label: "Site audit",
      description:
        "AuditWorkspace — deterministic site-wide rollup over stored per-snapshot metrics: verdicts, pass rates, worst pages.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/audit/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/findings",
      label: "Findings",
      description:
        "FindingsTable — the durable finding lifecycle register with direct filters.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/findings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/findings/[findingId]",
      label: "Finding detail",
      description:
        "FindingDetail — finding state, catalog context, and immutable evidence.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/findings/[findingId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/analysis",
      label: "Site analysis",
      description:
        "SiteAnalysisTable — the ranked open-finding priority queue for one site.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/analysis/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/coverage",
      label: "Coverage matrix",
      description:
        "CoverageWorkspace — the source-disagreement matrix over the canonical page registry with one-click filtered page lists.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/coverage/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/performance",
      label: "Site performance",
      description:
        "SitePerformanceWorkspace — PageSpeed coverage, score distribution, percentiles, and traffic-qualified fix priorities.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/performance/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/changes",
      label: "SEO changes",
      description:
        "SeoChangeTrackingWorkspace — interventions, implementation evidence, and measured outcomes; `?change=` selects a row.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/changes/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/backlinks",
      label: "Backlink intelligence",
      description:
        "BacklinksGate — provider evidence enriched with referring-page content, relevance, controllability, and first-party domain opinions.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/backlinks/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/links",
      label: "Link graph",
      description:
        "LinksInspectionTable — the current accepted link graph inspection workspace.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/links/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/authority",
      label: "Authority router",
      description:
        "AuthorityRouterWorkspace — route backlink and internal authority toward priority pages with evidence-grounded link recommendations.",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/authority/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/valuation",
      label: "Backlink valuation",
      description:
        "LinkValuationWorkspace — score a candidate backlink on quality, relevance, and placement, and price what it is worth (was /marketing/backlink-valuation).",
      filePath: "app/(core)/marketing/[brandId]/seo/[siteId]/valuation/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/ai-visibility",
      label: "AI visibility",
      description:
        "SiteAiVisibilityWorkspace — where AI assistants cite this site, which competitors answer instead, and the captured evidence.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/ai-visibility/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/ai-visibility/[view]",
      label: "AI visibility evidence",
      description:
        "Full-page claims, sources, decision signals, or provider history; the panels view renders SiteAiVisibilityPanels instead.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/ai-visibility/[view]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/growth-loop",
      label: "Growth loop",
      description:
        "SiteGrowthLoopWorkspace — run this site end to end and act on whatever the loop is waiting on.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/growth-loop/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/automations",
      label: "Site automations",
      description:
        "SiteRunConsoleMount — the run console at the SITE tier, with the schedule that overrides organization and system defaults (KI-049).",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/automations/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/seo/[siteId]/capabilities",
      label: "SEO capabilities",
      description:
        "SeoCapabilitiesWorkspace bound to this site — what's measured and switched on, and each capability's evidence.",
      filePath:
        "app/(core)/marketing/[brandId]/seo/[siteId]/capabilities/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content",
      label: "Content section",
      description:
        "Front door with no screen of its own — 308s to the Content Plan list.",
      filePath: "app/(core)/marketing/[brandId]/content/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan",
      label: "Content Plan list",
      description:
        "BrandScopedPlanSitesList → PlanSitesList — this client's websites and their plan coverage (the site dropdown inside stays cross-org on purpose).",
      filePath: "app/(core)/marketing/[brandId]/content/plan/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]",
      label: "Content Plan — Tree",
      description:
        "ContentPlanRouteBody, tree view (the workspace index); `?node=` carries row selection.",
      filePath: "app/(core)/marketing/[brandId]/content/plan/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]/table",
      label: "Content Plan — Table",
      description: "ContentPlanRouteBody, table view of the same plan workspace.",
      filePath:
        "app/(core)/marketing/[brandId]/content/plan/[siteId]/table/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]/map",
      label: "Content Plan — Pillar map",
      description: "ContentPlanRouteBody, pillar-map view.",
      filePath:
        "app/(core)/marketing/[brandId]/content/plan/[siteId]/map/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]/entities",
      label: "Content Plan — Entities",
      description: "ContentPlanRouteBody, entities view.",
      filePath:
        "app/(core)/marketing/[brandId]/content/plan/[siteId]/entities/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]/setup",
      label: "Content Plan — Setup",
      description: "ContentPlanRouteBody, setup view.",
      filePath:
        "app/(core)/marketing/[brandId]/content/plan/[siteId]/setup/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/plan/[siteId]/ai-runs",
      label: "Content Plan — AI runs",
      description:
        "ContentPlanRouteBody, AI-runs view (the sixth PLAN_VIEWS entry the workspace header links).",
      filePath:
        "app/(core)/marketing/[brandId]/content/plan/[siteId]/ai-runs/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/content/studio",
      label: "Content Studio",
      description:
        "RESERVED — renders <MarketingComingSoon comingSoonId=\"marketing.content-studio\">; the URL is permanent.",
      filePath: "app/(core)/marketing/[brandId]/content/studio/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/[brandId]/locations",
      label: "Locations & Listings",
      description:
        "LocalListingsWorkspace for the brand — business locations, listings, and reviews.",
      filePath: "app/(core)/marketing/[brandId]/locations/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/locations/[locationId]",
      label: "Location workspace",
      description:
        "LocalListingsWorkspace for one canonical location — publisher listings matrix and citation coverage.",
      filePath:
        "app/(core)/marketing/[brandId]/locations/[locationId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/socials",
      label: "Social accounts",
      description:
        "RESERVED — renders <MarketingComingSoon comingSoonId=\"marketing.social\">; the URL is permanent.",
      filePath: "app/(core)/marketing/[brandId]/socials/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/[brandId]/email",
      label: "Email",
      description:
        "BrandScopedEmail → EmailFrontDoor — the mailbox, templates, and sequences outreach sends from. Mailboxes are counted in the brand's organization; templates/campaigns have no brand link and say so on the page.",
      filePath: "app/(core)/marketing/[brandId]/email/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/pr",
      label: "Press Room",
      description:
        "PressRoomWorkspace — what is newsworthy, the proof, the journalists to pitch (still self-selects a brand from `?brand=`).",
      filePath: "app/(core)/marketing/[brandId]/pr/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/pr/outreach",
      label: "Outreach",
      description:
        "BrandScopedOutreach → OutreachFrontDoor — prospecting scoped to this client's websites and its organization's mailboxes; the CRM doors (campaigns, Chasebox, replies, wins) have no brand link and are labelled as counting across your clients.",
      filePath: "app/(core)/marketing/[brandId]/pr/outreach/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/ads",
      label: "Advertising",
      description:
        "GoogleAdsWorkspace inside LazyGoogleAPIProvider — the ad center's first room; the wider center is the `marketing.ads` promise.",
      filePath: "app/(core)/marketing/[brandId]/ads/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/intelligence",
      label: "Intelligence section",
      description:
        "Front door with no screen of its own — 308s to Competitors.",
      filePath: "app/(core)/marketing/[brandId]/intelligence/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/intelligence/competitors",
      label: "Competitors",
      description:
        "CompetitorAutopsyWorkspace — overlapping rivals, the pages earning their visibility, and ranked opportunities.",
      filePath:
        "app/(core)/marketing/[brandId]/intelligence/competitors/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/intelligence/monitoring",
      label: "Monitoring",
      description:
        "MonitoringFrontDoor — scopes to a site and opens coverage, link changes, AI visibility, and reputation (site picker still org-wide).",
      filePath:
        "app/(core)/marketing/[brandId]/intelligence/monitoring/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/intelligence/reputation",
      label: "Reputation chooser",
      description:
        "BrandReputationSites — reputation is answered per website, so the brand level is a chooser over this brand's sites.",
      filePath:
        "app/(core)/marketing/[brandId]/intelligence/reputation/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/intelligence/reputation/[siteId]",
      label: "Site reputation",
      description:
        "ReputationGate — evidence-backed publication opportunities and reputation handling decisions for one site.",
      filePath:
        "app/(core)/marketing/[brandId]/intelligence/reputation/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/analytics",
      label: "Analytics",
      description:
        "RESERVED — renders <MarketingComingSoon comingSoonId=\"marketing.analytics\">; the URL is permanent.",
      filePath: "app/(core)/marketing/[brandId]/analytics/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/[brandId]/planning",
      label: "Planning section",
      description:
        "Front door with no screen of its own — 308s to Initiatives.",
      filePath: "app/(core)/marketing/[brandId]/planning/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/planning/initiatives",
      label: "Initiatives",
      description:
        "InitiativesListPage — the container above channels (still organization-scoped rather than brand-scoped).",
      filePath:
        "app/(core)/marketing/[brandId]/planning/initiatives/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/planning/initiatives/[id]",
      label: "Initiative detail",
      description:
        "InitiativeDetail — timeline, goal, budget, and version-guarded editing for one initiative UUID.",
      filePath:
        "app/(core)/marketing/[brandId]/planning/initiatives/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/planning/calendar",
      label: "Calendar",
      description:
        "RESERVED — renders <MarketingComingSoon comingSoonId=\"marketing.calendar\">; the URL is permanent.",
      filePath: "app/(core)/marketing/[brandId]/planning/calendar/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/[brandId]/inbox",
      label: "Discovery inbox",
      description:
        "DiscoveryInbox — review machine-found assets, properties, and facts before they join the brand.",
      filePath: "app/(core)/marketing/[brandId]/inbox/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/[brandId]/settings",
      label: "Brand settings",
      description:
        "ValueSettingsEditor + AutonomyModesEditor at the BRAND rung of the ladder; sites inherit unless they override.",
      filePath: "app/(core)/marketing/[brandId]/settings/page.tsx",
      status: "Live",
    },

    // ── Legacy redirect shims (pre-restructure addresses; no screen) ──────
    {
      url: "/marketing/brands/[brandId]",
      label: "Legacy brand tree",
      description:
        "ONE catch-all for the whole pre-restructure `/marketing/brands/[brandId]/**` tree — 308s each old brand or site path to its home under /marketing/[brandId].",
      filePath: "app/(core)/marketing/brands/[brandId]/[[...rest]]/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/sites",
      label: "Legacy site portfolio",
      description:
        "308s to the client roster — a website belongs to a client, so the agency plane has no site list.",
      filePath: "app/(core)/marketing/sites/page.tsx",
      status: "Deprecated",
      notes: [
        "sites/new/page.tsx → /marketing/brands/new-website (query rides along)",
        "sites/[siteId]/page.tsx → that site's website-inventory overview",
        "sites/[siteId]/[...rest]/page.tsx → the mapped websites/ or seo/ section",
      ],
    },
    {
      url: "/marketing/connections",
      label: "Legacy connections",
      description:
        "308s to /marketing/operations/connections (the Bing OAuth callback deliberately stayed put).",
      filePath: "app/(core)/marketing/connections/page.tsx",
      status: "Deprecated",
      notes: [
        "connections/google/page.tsx → operations/connections/google",
        "connections/google/read-only/page.tsx → operations/connections/google/read-only",
        "connections/bing/page.tsx → operations/connections/bing",
      ],
    },
    {
      url: "/marketing/content-plan",
      label: "Legacy content plan",
      description:
        "308s to the client roster; `content-plan/[siteId]` resolves its brand and lands on that site's plan workspace.",
      filePath: "app/(core)/marketing/content-plan/page.tsx",
      status: "Deprecated",
      notes: [
        "content-plan/[siteId]/page.tsx → /marketing/[brand]/content/plan/[site] (old ?view= becomes a route segment)",
      ],
    },
    {
      url: "/marketing/initiatives",
      label: "Legacy initiatives",
      description:
        "308s to the client roster; Initiatives is a Planning screen on the brand now.",
      filePath: "app/(core)/marketing/initiatives/page.tsx",
      status: "Deprecated",
      notes: [
        "initiatives/[id]/page.tsx → the initiative inside its client's Planning section",
      ],
    },
    {
      url: "/marketing/discovery/youtube",
      label: "Legacy YouTube discovery",
      description:
        "308s to /marketing/tools/youtube; the video preview leaf forwards with it.",
      filePath: "app/(core)/marketing/discovery/youtube/page.tsx",
      status: "Deprecated",
      notes: [
        "discovery/youtube/videos/[videoId]/page.tsx → tools/youtube/videos/[videoId]",
      ],
    },
    {
      url: "/marketing/admin/keyword-data-quality",
      label: "Legacy data-quality admin",
      description:
        "308s to /marketing/operations/data-quality — keyword data quality is an agency operation now.",
      filePath: "app/(core)/marketing/admin/keyword-data-quality/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/search-console",
      label: "Legacy Search Console",
      description:
        "`?site=` resolves onto that site's SEO Search Console screen; without one, the client roster.",
      filePath: "app/(core)/marketing/search-console/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/capabilities",
      label: "Legacy capabilities",
      description:
        "`?site=` resolves onto that site's SEO Capabilities screen; without one, the client roster.",
      filePath: "app/(core)/marketing/capabilities/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/local",
      label: "Legacy Local & Listings",
      description:
        "`?brand=` / `?location=` resolve onto /marketing/[brand]/locations; a plain visit lands on the client roster.",
      filePath: "app/(core)/marketing/local/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/cost",
      label: "Legacy cost",
      description: "308s to /marketing/reports/cost.",
      filePath: "app/(core)/marketing/cost/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/ranks",
      label: "Legacy ranks",
      description: "308s to /marketing/reports/ranks.",
      filePath: "app/(core)/marketing/ranks/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/approvals",
      label: "Legacy approvals",
      description: "308s to /marketing/operations/approvals.",
      filePath: "app/(core)/marketing/approvals/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/automations",
      label: "Legacy automations",
      description: "308s to /marketing/operations/automations.",
      filePath: "app/(core)/marketing/automations/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/keyword-research",
      label: "Legacy keyword research",
      description:
        "308s to the client roster; research lives at /marketing/[brand]/seo/[site]/keywords/research.",
      filePath: "app/(core)/marketing/keyword-research/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/keyword-intelligence",
      label: "Legacy keyword intelligence",
      description:
        "308s to the client roster; keywords live at /marketing/[brand]/seo/[site]/keywords.",
      filePath: "app/(core)/marketing/keyword-intelligence/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/backlink-valuation",
      label: "Legacy backlink valuation",
      description:
        "308s to the client roster; valuation lives at /marketing/[brand]/seo/[site]/valuation.",
      filePath: "app/(core)/marketing/backlink-valuation/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/ai-visibility",
      label: "Legacy AI visibility",
      description:
        "308s to the client roster; AI visibility lives at /marketing/[brand]/seo/[site]/ai-visibility.",
      filePath: "app/(core)/marketing/ai-visibility/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/competitors",
      label: "Legacy competitors",
      description:
        "308s to the client roster; Competitors is a brand Intelligence screen.",
      filePath: "app/(core)/marketing/competitors/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/monitoring",
      label: "Legacy monitoring",
      description:
        "308s to the client roster; Monitoring is a brand Intelligence screen.",
      filePath: "app/(core)/marketing/monitoring/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/pr",
      label: "Legacy press room",
      description:
        "308s to the client roster; the Press Room is a brand section.",
      filePath: "app/(core)/marketing/pr/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/email",
      label: "Legacy email",
      description: "308s to the client roster; Email is a brand section.",
      filePath: "app/(core)/marketing/email/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/outreach",
      label: "Legacy outreach",
      description:
        "308s to the client roster; outreach lives beside the brand's Email section.",
      filePath: "app/(core)/marketing/outreach/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/ads",
      label: "Legacy paid ads",
      description:
        "308s to the client roster; Advertising is a brand section.",
      filePath: "app/(core)/marketing/ads/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/social",
      label: "Legacy social",
      description:
        "308s to the client roster; Socials is a reserved brand section.",
      filePath: "app/(core)/marketing/social/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/analytics",
      label: "Legacy analytics",
      description:
        "308s to the client roster; Analytics is a reserved brand section.",
      filePath: "app/(core)/marketing/analytics/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/calendar",
      label: "Legacy calendar",
      description:
        "308s to the client roster; the Calendar is reserved under brand Planning.",
      filePath: "app/(core)/marketing/calendar/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/audience",
      label: "Legacy audience",
      description:
        "308s to the client roster; Audience is reserved under brand Identity.",
      filePath: "app/(core)/marketing/audience/page.tsx",
      status: "Deprecated",
    },
    {
      url: "/marketing/content-studio",
      label: "Legacy content studio",
      description:
        "308s to the client roster; the Studio is reserved under brand Content.",
      filePath: "app/(core)/marketing/content-studio/page.tsx",
      status: "Deprecated",
    },
  ],
  windowPanels: [
    {
      overlayId: "marketingMediaAssetWindow",
      description:
        "Resizable crawled-image detail window: canonical ImageViewer canvas plus a resizable metadata/action inspector with page doors, standards verdict, library promotion, editing, and replacement ordering.",
    },
    {
      overlayId: "keywordResearchWindow",
      description:
        "Canonical keyword research runner in a floating window: shared KeywordResearchLauncher (live key-by-key kind-component stream) + compact cluster explorer. Open from anywhere via useOpenKeywordResearchWindow({ primaryKeyword, autoRun }).",
    },
    {
      overlayId: "serpAnalyzerWindow",
      description: "Search Appearance (MetadataAnalyzer) in a floating window.",
    },
    {
      overlayId: "socialCardAnalyzerWindow",
      description: "Social Cards (SocialCardAnalyzer) in a floating window.",
    },
    {
      overlayId: "keywordWindow",
      description:
        "Keyword Intelligence — the canonical per-keyword dossier (market, classification, relationships, site performance, rankings, SERP, research). Registered agent surface matrx-user/keyword-intelligence.",
    },
    {
      overlayId: "gscDrilldownWindow",
      description:
        "Search Console drill-down panel (multi-instance): any (site, dimension, filters, period) slice as KPI band + mini chart + dimension table; panel rows re-drill into further panels for side-by-side comparison. Opened from Search Console rows and Keyword Value topic rows via useOpenGscDrilldownWindow.",
    },
  ],
  components: [
    {
      name: "CrmFoldControl / StartOutreachOnDomain / CaseVerdictAction (outreach doors)",
      filePath: "features/crm/components/outreach-start/",
      description:
        "The G9 doors on marketing surfaces: 'Start outreach' on a reputation case (pitch / request_update / correct / respond) and on a referring-domain prospect (toxic refuses with the reason), plus the auto|manual|off CRM fold control rendered on site settings AND beside the prospect/case lists — one record, two renders. Components live in features/crm/ because the CRM owns the enrollment and the send gate; marketing only mounts them.",
      tier: "internal",
    },
    {
      name: "MarketingReportsWorkspace",
      filePath: "features/marketing/reports/MarketingReportsWorkspace.tsx",
      description:
        "Client-ready report composition over the canonical seo.gsc_perf_* reads, including GscPortfolioClassBar, site/page GscClassBar rollups, and EntityRef doors.",
      tier: "internal",
    },
    {
      name: "SiteKpiPeeks (GscMetricPeek / PagesPeek / MiniTrendChart / TrendDelta)",
      filePath: "features/marketing/components/sites/SiteKpiPeeks.tsx",
      description:
        "Hover peeks for the sites-portfolio KPI cells: 30/90-day daily GSC trend (hand-rolled SVG chart — no charting lib) + top-10 pages via web.site_gsc_daily / web.site_gsc_top_pages, plus the page-inventory breakdown and the trend-delta chip (suppressed while prior-window GSC coverage is partial).",
      tier: "official",
    },
    {
      name: "SitePeekWindow (site quick view)",
      filePath: "features/marketing/components/sites/SitePeekWindow.tsx",
      description:
        "Non-blocking draggable WindowPanel quick view for one site (KPI tiles, metric-switchable 90d chart, top pages). Opened from the sites-list row menu behind a dynamic() edge — AgentPeekWindow pattern.",
      tier: "official",
    },
    {
      name: "KeywordResearchLauncher (features/marketing/seo/keyword-research) — live output via MarkdownStream",
      filePath:
        "features/marketing/seo/keyword-research/components/KeywordResearchLauncher.tsx",
      description:
        "Canonical research runner: input → live key-by-key kind-component stream (keyword_relationship_research / keyword_classification_batch_v1 via content-ir) → durable summary. Consumed by the workbench page AND the Keyword Research window panel.",
      tier: "official",
    },
    {
      name: "KeywordMetrics (sparkline, competition, intent chip, confidence meter, formats)",
      filePath:
        "features/marketing/seo/keyword-research/components/KeywordMetrics.tsx",
      description:
        "THE shared keyword presentation primitives — every keyword surface (workbench, window panel, seo tool renderer, content-plan picker, site performance table, chat classification cards) consumes these; no private copies.",
      tier: "official",
    },
    {
      name: "KeywordResearchBlock + KeywordClassificationBatchBlock",
      filePath:
        "components/mardown-display/blocks/keyword-research/KeywordResearchBlock.tsx",
      description:
        "Kind renderers for keyword_relationship_research / keyword_classification_batch_v1 — streaming-first (chips/cards pop in per item), used in chat and any live feed.",
      tier: "official",
    },
    {
      name: "MatrxDataTable",
      filePath: "components/official/matrx-data-table/MatrxDataTable.tsx",
      description: "Canonical dense table in controlled direct-query mode.",
      tier: "official",
    },
    {
      name: "SocialCardAnalyzer (features/marketing/seo/social)",
      filePath: "features/marketing/seo/social/SocialCardAnalyzer.tsx",
      description:
        "Canonical social share analyzer: platform-faithful X/Facebook/LinkedIn cards + deterministic OG/Twitter checks (features/marketing/seo/audit, TS↔Python parity). Consumed by the page-workspace social section, the Social Cards window panel (overlayId socialCardAnalyzerWindow), and the public /seo/social-preview page.",
      tier: "official",
    },
    {
      name: "Page-audit evaluators (features/marketing/seo/audit)",
      filePath: "features/marketing/seo/audit/README.md",
      description:
        "Deterministic social/headings/indexability evaluators stamped into web.snapshot.audit_metrics by the scraper on every capture.",
      tier: "official",
    },
    {
      name: "MetadataAnalyzer (features/marketing/seo/serp)",
      filePath: "features/marketing/seo/serp/MetadataAnalyzer.tsx",
      description:
        "Canonical SERP/metadata analyzer consumed by the page-workspace SERP section, the Search Appearance window panel (overlayId serpAnalyzerWindow), and the public /seo/metadata page. Deterministic metrics, TS↔Python parity-tested.",
      tier: "official",
    },
    {
      name: "buildMarketingPageScope",
      filePath: "features/marketing/lib/marketing-page-scope.ts",
      description:
        "Runtime scope builder for the matrx-user/marketing-page surface (agent launches).",
      tier: "internal",
    },
    {
      name: "MarketingSiteLayoutClient",
      filePath:
        "features/marketing/components/site/MarketingSiteLayoutClient.tsx",
      description: "Site access/context shell and route navigation.",
      tier: "internal",
    },
    {
      name: "Marketing data service",
      filePath: "features/marketing/data/service.ts",
      description:
        "The only persisted-data query path: browser Supabase client scoped to web.",
      tier: "internal",
    },
  ],
  relatedFeatures: [
    {
      name: "Scraper",
      description:
        "Receives direct authenticated commands and emits transient live progress; it never serves Marketing history.",
    },
    {
      name: "CMS",
      adminUrl: "/cms/admin",
      description:
        "Will consume the same stable site/page identity as publishing workflows expand.",
    },
  ],
};

export default function MarketingAdminPage() {
  return <FeatureAdminPage map={MARKETING_ADMIN_MAP} />;
}
