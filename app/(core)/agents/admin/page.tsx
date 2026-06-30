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
    { label: "Agent Sets (Orchestrators)", href: "/features/agents/docs/AGENT_SETS.md" },
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
    {
      url: "/agents/sets",
      label: "Agent Sets",
      description:
        "List of orchestrated agent sets (savior list view). Create a set; open one to build it.",
      filePath: "app/(core)/agents/sets/page.tsx",
      status: "Live",
    },
    {
      url: "/agents/sets/[orchestratorId]",
      label: "Set Builder",
      description:
        "Hub-and-spoke builder for one set — drag agents from the library onto the React Flow canvas (code-split), reorder in the grid, and author each member's role.",
      filePath: "app/(core)/agents/sets/[orchestratorId]/page.tsx",
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
    {
      name: "SetBuilder",
      filePath: "features/agents/agent-sets/components/SetBuilder.tsx",
      description:
        "Agent Sets builder shell — composes the library rail, canvas/grid views, and the member inspector around one orchestrator.",
      tier: "official",
    },
    {
      name: "SetBuilderCanvas (+ Impl)",
      filePath: "features/agents/agent-sets/components/SetBuilderCanvas.tsx",
      description:
        "Code-split React Flow hub-and-spoke canvas (the ONLY @xyflow/react importer; behind next/dynamic ssr:false + eslint static-import ban).",
      tier: "official",
    },
    {
      name: "AgentRoleCard",
      filePath: "features/agents/agent-sets/components/AgentRoleCard.tsx",
      description:
        "Reusable member card — renders 'what this agent does in the set' from its description + authored role/gap. Used as a canvas node and a grid tile.",
      tier: "official",
    },
    {
      name: "AgentSetCard",
      filePath: "features/agents/agent-sets/components/AgentSetCard.tsx",
      description: "List tile for one set on /agents/sets (orchestrator face + member strip).",
      tier: "official",
    },
    {
      name: "AddToSetMenu",
      filePath: "features/agents/agent-sets/components/AddToSetMenu.tsx",
      description:
        "Agent-card action: add an agent to an existing set or start a new set seeded with it.",
      tier: "official",
    },
    {
      name: "agentSetsService",
      filePath: "features/agents/agent-sets/service/agentSetsService.ts",
      description:
        "Thin service over the canonical association chokepoint + the agent_set_list() RPC. Owns no new mutation path.",
      tier: "internal",
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
    {
      name: "agentSets",
      filePath: "features/agents/agent-sets/redux/slice.ts",
      description:
        "Agent Sets read-model: enumerated set list + per-set member/config cache (membership truth lives in platform.associations).",
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
    {
      name: "Associations (Scopes)",
      description:
        "Agent Sets ride the canonical platform.associations system (assoc_* RPCs via associationsService). No agent_set table — orchestrator→member edges are the membership.",
    },
  ],
};

export default function AgentsAdminPage() {
  return <FeatureAdminPage map={AGENTS_ADMIN_MAP} />;
}
