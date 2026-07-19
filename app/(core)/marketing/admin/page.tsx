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
      url: "/marketing/sites/[siteId]/crawls/[crawlId]/logs",
      label: "Crawl events",
      description:
        "Durable ordered event history, separate from the transient live stream.",
      filePath:
        "app/(core)/marketing/sites/[siteId]/crawls/[crawlId]/logs/page.tsx",
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
