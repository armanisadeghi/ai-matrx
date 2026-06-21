// app/(core)/agents/admin/page.tsx
//
// Per-feature admin map for the Agents ecosystem. Renders via the platform
// primitive <FeatureAdminPage> (admin-gated, utilitarian). The agents feature
// is large and sprawls across many folders; this map was SEEDED with the Find
// Usages + Drift Detection resources plus the primary agent routes, and should
// be grown toward a full inventory over time. The drift warnings on the
// rendered page surface routes/panels not yet enumerated here.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const AGENTS_ADMIN_MAP: FeatureAdminMap = {
  name: "Agents",
  slug: "agents",
  description:
    "The agent system — definitions, versions, shortcuts, apps, surfaces, and the Find Usages + Drift Detection subsystem (this seed focuses on the latter plus the core agent routes; grow toward a full inventory).",
  docs: [
    { label: "Agents FEATURE.md", href: "/features/agents/FEATURE.md" },
    { label: "Reports admin map", href: "/reports/admin" },
  ],
  routeScanPath: "app/(core)/agents",

  routes: [
    {
      url: "/agents/all",
      label: "All agents",
      description:
        "The agents gallery — list, filter, open, fork. Drift severity shows in the page header.",
      filePath: "app/(core)/agents/all/page.tsx",
      status: "Live",
    },
    {
      url: "/reports/agent-drift",
      label: "Agent Drift report",
      description:
        "Red flags across all the caller's agents (master-detail; reuses the Find Usages engine).",
      filePath: "app/(core)/reports/agent-drift/page.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "agentFindUsagesWindow",
      description:
        "Find Usages — every place an agent is used (own + org-managed in detail, others aggregated), drift red flags first, one-click + bulk remediation.",
      status: "Live",
    },
    {
      overlayId: "agentAdminFindUsagesWindow",
      description:
        "Find Usages (Admin) — system-wide usages across all users with filters and 'Inform all affected users' bulk DM. Super-admin only.",
      status: "Live",
    },
  ],

  components: [
    {
      name: "AgentUsagesEngine",
      filePath: "features/agents/components/usages/AgentUsagesEngine.tsx",
      description:
        "Shared engine behind both Find Usages windows + the drift report detail pane (mode user | admin).",
      tier: "official",
    },
    {
      name: "DriftSeverityBadge + severity map",
      filePath: "features/agents/components/usages/severity.ts",
      description:
        "Single source for severity presentation: breaking / silent_breaking / warning / info.",
      tier: "official",
    },
    {
      name: "AgentsListHeader (drift indicator)",
      filePath: "features/agents/components/shell/AgentsListHeader.tsx",
      description:
        "Agents gallery header — severity-colored Drift report link when weekly-scan alerts are active.",
      tier: "official",
    },
    {
      name: "NotifyOwnerDialog",
      filePath: "features/agents/components/usages/NotifyOwnerDialog.tsx",
      description:
        "Sends drift notification DMs (single / org managers / inform-all).",
      tier: "official",
    },
  ],

  apiRoutes: [
    {
      url: "{python}/agent-usage/sync",
      method: "POST",
      description:
        "Sync code-declared agent usages into agx_usage_registry. Super-admin only.",
      filePath: "aidream/api/routers/agent_usage_admin.py",
    },
    {
      url: "{python}/agent-usage/scan",
      method: "POST",
      description:
        "Run the weekly drift scan immediately (writes alerts + sends DMs).",
      filePath: "aidream/api/routers/agent_usage_admin.py",
    },
  ],

  reduxSlices: [
    {
      name: "agentUsages",
      filePath: "features/agents/redux/usages/usages.slice.ts",
      description:
        "Find-usages caches (scope-keyed), drift report rollups, and drift alerts for the banner.",
    },
  ],

  relatedFeatures: [
    {
      name: "Reports",
      adminUrl: "/reports/admin",
      description: "Agent Drift is report #1 of the reports module.",
    },
    {
      name: "Messaging",
      description:
        "Drift notifications ride the DM system (action_data deep-link chips).",
    },
    {
      name: "Scheduling",
      description:
        "The weekly drift scan is a system sch_task (agent_drift_weekly_scan).",
    },
  ],
};

export default function AgentsAdminPage() {
  return <FeatureAdminPage map={AGENTS_ADMIN_MAP} />;
}
