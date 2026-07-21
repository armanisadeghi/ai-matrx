import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const MARKETING_ADMIN_MAP: FeatureAdminMap = {
  name: "Marketing Sites",
  slug: "marketing",
  description:
    "Site-rooted marketing operations: managed websites, canonical page identity, immutable crawl sessions and snapshots, per-run URL outcomes, and durable crawler events. Persisted data is read directly from Supabase by the browser.",
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
      label: "Marketing root",
      description: "Redirects to the managed-site portfolio.",
      filePath: "app/(core)/marketing/page.tsx",
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
      url: "/marketing/admin",
      label: "Feature admin map",
      description:
        "Inventory of the current Marketing route and component surface.",
      filePath: "app/(core)/marketing/admin/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "MatrxDataTable",
      filePath: "components/official/matrx-data-table/MatrxDataTable.tsx",
      description: "Canonical dense table in controlled direct-query mode.",
      tier: "official",
    },
    {
      name: "SocialCardAnalyzer (features/seo/social)",
      filePath: "features/seo/social/SocialCardAnalyzer.tsx",
      description:
        "Canonical social share analyzer: platform-faithful X/Facebook/LinkedIn cards + deterministic OG/Twitter checks (features/seo/audit, TS↔Python parity). Consumed by the page-workspace social section, the Social Cards window panel (overlayId socialCardAnalyzerWindow), and the public /seo/social-preview page.",
      tier: "official",
    },
    {
      name: "Page-audit evaluators (features/seo/audit)",
      filePath: "features/seo/audit/README.md",
      description:
        "Deterministic social/headings/indexability evaluators stamped into web.snapshot.audit_metrics by the scraper on every capture.",
      tier: "official",
    },
    {
      name: "MetadataAnalyzer (features/seo/serp)",
      filePath: "features/seo/serp/MetadataAnalyzer.tsx",
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
