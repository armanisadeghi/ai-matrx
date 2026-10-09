// app/(core)/applets/admin/page.tsx
//
// Per-feature admin map for Applets (features/admin/FEATURE.md § Per-feature admin map). Every
// Applet route, how a person reaches it, and the admin pages. `admin` is a reserved Applet slug
// (features/applets/reserved-slugs.ts + the `definition_slug_not_reserved_check` constraint) so this
// static route never shadows a running Applet at /applets/<slug>. Add every new Applet route here.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const APPLETS_ADMIN_MAP: FeatureAdminMap = {
  name: "Applets",
  slug: "applets",
  description:
    "What a customer builds on their own tables: a builder, owner tools per Applet, the running Applet at its own address, templates, and the platform admin pages. Data: app.definition / app.version / app.execution.",
  docs: [
    { label: "Applets FEATURE.md", href: "/features/applets/FEATURE.md" },
    { label: "Applet host FEATURE.md", href: "/features/applets-host/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/applets",

  routes: [
    {
      url: "/applets",
      label: "Applets",
      description: "Signed out: the Applets landing. Signed in: your Applets list. Sidebar › Applets › All Applets.",
      filePath: "app/(core)/applets/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/build",
      label: "Build an Applet",
      description: "Describe it, get it. Sidebar › Applets › Build an Applet, or the list page's Build button.",
      filePath: "app/(core)/applets/build/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/build/[id]",
      label: "One build",
      description: "A build at its own address; Build mints it, a draft row in the list reopens it.",
      filePath: "app/(core)/applets/build/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]",
      label: "Owner tools: Overview",
      description: "Opened from a list row. Tabs: Overview, Run, Code, Versions, Settings.",
      filePath: "app/(core)/applets/manage/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]/run",
      label: "Owner tools: Run",
      description: "The Applet itself inside the owner tools (Run tab).",
      filePath: "app/(core)/applets/manage/[id]/run/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]/code",
      label: "Owner tools: Code",
      description: "The Applet's files in the code workspace (Code tab).",
      filePath: "app/(core)/applets/manage/[id]/code/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]/versions",
      label: "Owner tools: Versions",
      description: "Every saved version (Versions tab); each row opens /v/[version].",
      filePath: "app/(core)/applets/manage/[id]/versions/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]/v/[version]",
      label: "One version",
      description: "Read-only snapshot with a code compare against the current version.",
      filePath: "app/(core)/applets/manage/[id]/v/[version]/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/manage/[id]/settings",
      label: "Owner tools: Settings",
      description: "Name, address, status, sharing, delete (Settings tab).",
      filePath: "app/(core)/applets/manage/[id]/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/[slug]/[[...path]]",
      label: "The running Applet",
      description: "The share link. An id in place of the slug resolves to the slug. Guests see its intro page.",
      filePath: "app/(link)/applets/[slug]/[[...path]]/page.tsx",
      status: "Live",
    },
    {
      url: "/templates/applets",
      label: "Applet templates",
      description: "Public gallery. Sidebar › Applets › Applet Templates.",
      filePath: "app/(public)/templates/applets/page.tsx",
      status: "Live",
    },
    {
      url: "/organizations/[orgId]/applets",
      label: "An organization's Applets",
      description: "Organization page › Applets (features/organizations/resource-catalogue.ts).",
      filePath: "app/(core)/organizations/[orgId]/applets/page.tsx",
      status: "Live",
    },
    {
      url: "/applets/admin",
      label: "Admin map (this page)",
      description: "The FeatureAdminMap for Applets.",
      filePath: "app/(core)/applets/admin/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets",
      label: "Admin: Applets dashboard",
      description: "Counts, featured and recently updated Applets. Admin › Agents › Published Applets.",
      filePath: "app/(admin)/administration/applets/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/all",
      label: "Admin: All Applets",
      description: "Every Applet on the platform: feature, verify, moderate. Row opens edit/[id].",
      filePath: "app/(admin)/administration/applets/all/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/edit/[id]",
      label: "Admin: one Applet",
      description: "Admin controls, preview and metadata for one Applet.",
      filePath: "app/(admin)/administration/applets/edit/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/categories",
      label: "Admin: Applet categories",
      description: "The category list shown in public Applet browsing.",
      filePath: "app/(admin)/administration/applets/categories/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/executions",
      label: "Admin: Applet runs",
      description: "Runs and errors across every Applet.",
      filePath: "app/(admin)/administration/applets/executions/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/analytics",
      label: "Admin: Applet analytics",
      description: "Usage and cost across Applets.",
      filePath: "app/(admin)/administration/applets/analytics/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/applets/rate-limits",
      label: "Admin: Applet rate limits",
      description: "Rate limits on Applet runs.",
      filePath: "app/(admin)/administration/applets/rate-limits/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/agents/system-agents/apps",
      label: "Admin: System Applets",
      description: "The platform's own (global) Applets. Admin › Agents › System Agents › Applets.",
      filePath: "app/(admin)/administration/agents/system-agents/apps/page.tsx",
      status: "Live",
    },
  ],

  apiRoutes: [
    {
      url: "/api/applets/[id]",
      method: "Multiple",
      description: "Single-Applet route handler.",
      filePath: "app/api/applets/[id]/route.ts",
    },
    {
      url: "/api/applets/[id]/duplicate",
      method: "POST",
      description: "Duplicate an Applet.",
      filePath: "app/api/applets/[id]/duplicate/route.ts",
    },
  ],

  relatedFeatures: [
    { name: "Applet host", description: "Runs an Applet at /applets/<slug> and in the owner Run tab." },
    { name: "Organizations", description: "Each organization page lists its Applets." },
  ],
};

export default function AppletsAdminPage() {
  return <FeatureAdminPage map={APPLETS_ADMIN_MAP} />;
}
