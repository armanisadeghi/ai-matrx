import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const MARKETING_ADMIN_MAP: FeatureAdminMap = {
  name: "Marketing",
  slug: "marketing",
  description:
    "The Marketing module: brands and websites (crawler, canonical page registry, immutable snapshots, audits), strategy and planning, discovery and search visibility, channels, market intelligence, and measurement. Structure is declared ONCE in features/marketing/lib/marketing-nav.ts. Persisted data is read directly from Supabase by the browser.",
  docs: [
    { label: "Marketing FEATURE.md", href: "/features/marketing/FEATURE.md" },
    {
      label: "Route architecture",
      href: "/docs/MARKETING_SITE_ROUTE_ARCHITECTURE.md",
    },
    {
      label: "Canonical web schema",
      href: "/docs/WEB_SCHEMA_CANONICAL_REFERENCE.md",
    },
  ],
  routeScanPath: "app/(core)/marketing",
  routes: [
    {
      url: "/marketing",
      label: "Marketing hub",
      description:
        "List view of every Marketing pillar. Structure declared in features/marketing/lib/marketing-nav.ts.",
      filePath: "app/(core)/marketing/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/content-plan",
      label: "Content Plan",
      description:
        "Editorial plan tree (pillars, clusters, briefs, keywords). Moved here from the root-level /content-plan on 2026-07-25.",
      filePath: "app/(core)/marketing/content-plan/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/keyword-research",
      label: "Keyword Research",
      description:
        "AI keyword relationship mapping plus live market data. Moved here from /seo/keyword-research on 2026-07-25.",
      filePath: "app/(core)/marketing/keyword-research/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/discovery/youtube",
      label: "YouTube Discovery",
      description:
        "Public-video search, expertise comparison, modal preview, and durable direct-preview routes.",
      filePath: "app/(core)/marketing/discovery/youtube/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/campaigns",
      label: "Campaigns",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/campaigns/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/calendar",
      label: "Calendar",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/calendar/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/audience",
      label: "Audience & Personas",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/audience/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/local",
      label: "Local & Listings",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/local/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/ranks",
      label: "Rank Tracking",
      description:
        "Cross-site rank portfolio — every tracked keyword across every brand and site (CrossSiteRanksHub).",
      filePath: "app/(core)/marketing/ranks/page.tsx",
    },
    {
      url: "/marketing/search-console",
      label: "Search Console",
      description:
        "The GSC data dashboard — cross-site portfolio + per-site deep view (?site=): KPI band, performance chart with compare, query/page/country/device/appearance tables over the seo.gsc_perf_* RPCs, GSC-parity drill-downs.",
      filePath: "app/(core)/marketing/search-console/page.tsx",
    },
    {
      url: "/marketing/ai-visibility",
      label: "AI Visibility",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/ai-visibility/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/content-studio",
      label: "Content Studio",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/content-studio/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/social",
      label: "Social",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/social/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/email",
      label: "Email",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/email/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/ads",
      label: "Paid Ads",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/ads/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/outreach",
      label: "Outreach",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/outreach/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/competitors",
      label: "Competitors",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/competitors/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/monitoring",
      label: "Brand Monitoring",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/monitoring/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/analytics",
      label: "Analytics",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/analytics/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/reports",
      label: "Reports",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/reports/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/marketing/automations",
      label: "Automations",
      description:
        "RESERVED — renders <MarketingComingSoon>. Declared in features/marketing/lib/marketing-nav.ts and tracked in lib/coming-soon/registry.ts. The URL is permanent; it will not move when the feature ships.",
      filePath: "app/(core)/marketing/automations/page.tsx",
      status: "Coming soon",
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
      url: "/marketing/sites",
      label: "Managed sites",
      description:
        "Controlled Supabase table of accessible sites and current health projections.",
      filePath: "app/(core)/marketing/sites/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/connections",
      label: "Data connections",
      description:
        "User and organization vault onboarding plus managed-site provider binding.",
      filePath: "app/(core)/marketing/connections/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/new",
      label: "Add site",
      description:
        "Creates a site in the selected organization through web.create_site.",
      filePath: "app/(core)/marketing/sites/new/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]",
      label: "Site overview",
      description:
        "Site identity, current rollups, integration status, and crawl baseline.",
      filePath: "app/(core)/marketing/sites/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/sitemaps",
      label: "Sitemaps",
      description:
        "Discovered sitemap documents, per-sitemap page membership, and sync.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/sitemaps/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/coverage",
      label: "Coverage matrix",
      description:
        "Source-disagreement matrix over the canonical page registry with one-click filtered page lists.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/coverage/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/backlinks",
      label: "Backlink intelligence",
      description:
        "Persisted authority, referring-domain, anchor, linked-page, competitor, and backlink evidence.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/backlinks/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/keywords",
      label: "Organic keywords",
      description:
        "Persisted 28-day GSC query performance with strongest-page and keyword-market enrichment.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/keywords/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/pages",
      label: "Canonical pages",
      description:
        "Stable URL registry, separate from every crawl's encountered URLs.",
      filePath: "app/(core)/marketing/sites/[siteId]/pages/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/pages/[pageId]",
      label: "Page workspace",
      description:
        "User-owned SEO intent plus the latest accepted observed snapshot.",
      filePath: "app/(core)/marketing/sites/[siteId]/pages/[pageId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/pages/[pageId]/snapshots",
      label: "Snapshot timeline",
      description: "Paginated immutable captures for one canonical page.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/pages/[pageId]/snapshots/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/pages/[pageId]/snapshots/[snapshotId]",
      label: "Snapshot detail",
      description:
        "Captured metadata, extraction, links, images, and durable body reference.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/pages/[pageId]/snapshots/[snapshotId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls",
      label: "Crawl sessions",
      description:
        "Frozen crawl events with status, scope, timing, and rollup stats.",
      filePath: "app/(core)/marketing/sites/[siteId]/crawls/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls/[crawlId]",
      label: "Crawl summary",
      description: "Coverage and reconciliation summary for one session.",
      filePath: "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls/[crawlId]/urls",
      label: "Crawl URL ledger",
      description:
        "Every encountered URL and its run-specific classification and outcome.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/urls/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]/reports",
      label: "Crawl report catalogue",
      description:
        "Dedicated bulk technical-SEO report index for one crawl session.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]/reports/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]/reports/[reportKey]",
      label: "Crawl report",
      description:
        "Response, metadata, heading, canonical, directive, image, content, structured-data, and performance reports.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]/reports/[reportKey]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls/[crawlId]/logs",
      label: "Crawl events",
      description:
        "Durable ordered event history, separate from the transient live stream.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/logs/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls/[crawlId]/snapshots",
      label: "Crawl snapshots",
      description: "Immutable captures produced by one crawl session.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/snapshots/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/crawls/[crawlId]/links",
      label: "Crawl link edges",
      description: "Run-specific link graph evidence scoped to one session.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/links/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/analysis",
      label: "Site analysis",
      description: "Ranked open-finding priority queue for one site.",
      filePath: "app/(core)/marketing/sites/[siteId]/analysis/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/findings",
      label: "Site findings",
      description: "Durable finding lifecycle register with direct filters.",
      filePath: "app/(core)/marketing/sites/[siteId]/findings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/findings/[findingId]",
      label: "Finding detail",
      description: "Finding state, catalog context, and immutable evidence.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/findings/[findingId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/links",
      label: "Site links",
      description: "Current accepted link graph inspection workspace.",
      filePath: "app/(core)/marketing/sites/[siteId]/links/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/integrations",
      label: "Site integrations",
      description:
        "Reference-only GSC, GA4, PageSpeed, and custom provider bindings.",
      filePath: "app/(core)/marketing/sites/[siteId]/integrations/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/cost",
      label: "Site cost",
      description: "Runtime cost by page, run, and batch execution item.",
      filePath: "app/(core)/marketing/sites/[siteId]/cost/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/access",
      label: "Site access",
      description: "Organization and user grants at the site access root.",
      filePath: "app/(core)/marketing/sites/[siteId]/access/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/sites/[siteId]/settings",
      label: "Site settings",
      description: "Identity, visibility, lifecycle, and crawl defaults.",
      filePath: "app/(core)/marketing/sites/[siteId]/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/batches",
      label: "Batch operations",
      description: "Cross-site queued, processing, completed, and failed jobs.",
      filePath: "app/(core)/marketing/batches/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/batches/[batchId]",
      label: "Batch detail",
      description: "Execution units, results, failures, and attributed cost.",
      filePath: "app/(core)/marketing/batches/[batchId]/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/cost",
      label: "Workspace cost",
      description: "Cross-site and client-organization cost rollups.",
      filePath: "app/(core)/marketing/cost/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/brands/[brandId]/sites/[siteId]/audit",
      label: "Site audit",
      description:
        "Deterministic site-wide rollup over stored per-snapshot metrics: verdicts, pass rates, top issues, worst pages.",
      filePath:
        "app/(core)/marketing/brands/[brandId]/sites/[siteId]/audit/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/admin",
      label: "Feature admin map",
      description:
        "Inventory of the current Marketing route and component surface.",
      filePath: "app/(core)/marketing/admin/page.tsx",
      status: "Live",
    },
    {
      url: "/marketing/admin/keyword-data-quality",
      label: "Keyword data quality",
      description:
        "Admin-only controls for the Keyword Classifier and Topic Assigner (DEF-25) — previously orphaned server routes.",
      filePath: "app/(core)/marketing/admin/keyword-data-quality/page.tsx",
      status: "Live",
    },
  ],
  windowPanels: [
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
        "Search Console drill-down panel (multi-instance): any (site, dimension, filters, period) slice as KPI band + mini chart + dimension table; panel rows re-drill into further panels for side-by-side comparison. Opened from row right-clicks on /marketing/search-console via useOpenGscDrilldownWindow.",
    },
  ],
  components: [
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
