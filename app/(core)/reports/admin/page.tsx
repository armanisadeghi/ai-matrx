// app/(core)/reports/admin/page.tsx
//
// Per-feature admin map for the Reports module. Renders via the platform
// primitive <FeatureAdminPage>. The module is new (Agent Drift is report #1);
// update this map as reports are added to features/reports/registry.ts.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const REPORTS_ADMIN_MAP: FeatureAdminMap = {
  name: "Reports",
  slug: "reports",
  description:
    "Cross-cutting reporting module. A metadata-only registry (features/reports/registry.ts) drives the landing pages; each report has a user route and an optional admin (platform-wide) route. First report: Agent Drift.",
  docs: [
    { label: "Reports FEATURE.md", href: "/features/reports/FEATURE.md" },
    { label: "Agents admin map", href: "/agents/admin" },
  ],
  routeScanPath: "app/(core)/reports",

  routes: [
    {
      url: "/reports",
      label: "Reports landing",
      description: "Card grid over the report registry (user scope).",
      filePath: "app/(core)/reports/page.tsx",
      status: "Live",
    },
    {
      url: "/reports/agent-drift",
      label: "Agent Drift (user)",
      description: "Drift across the caller's agents; master-detail with the Find Usages engine.",
      filePath: "app/(core)/reports/agent-drift/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/reports",
      label: "Reports landing (admin)",
      description: "Card grid over reports that have a platform-wide variant. Super-admin gated.",
      filePath: "app/(admin)/administration/reports/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/reports/agent-drift",
      label: "Agent Drift (admin)",
      description: "Platform-wide drift across every user's agents. Super-admin gated.",
      filePath: "app/(admin)/administration/reports/agent-drift/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "ReportsLanding",
      filePath: "features/reports/components/ReportsLanding.tsx",
      description: "Registry-driven card grid (mode user | admin).",
      tier: "official",
    },
    {
      name: "AgentDriftReport",
      filePath: "features/reports/components/agent-drift/AgentDriftReport.tsx",
      description: "Master-detail report; reuses AgentUsagesEngine for the detail pane.",
      tier: "official",
    },
  ],

  relatedFeatures: [
    {
      name: "Agents",
      adminUrl: "/agents/admin",
      description: "Agent Drift reads the agent usage-scan RPCs and reuses the Find Usages engine.",
    },
  ],
};

export default function ReportsAdminPage() {
  return <FeatureAdminPage map={REPORTS_ADMIN_MAP} />;
}
