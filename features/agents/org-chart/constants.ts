// features/agents/org-chart/constants.ts
//
// The agent org chart has two kinds of link, and only two (Arman, 2026-09-27):
//
//   • automatic — derived live from Orchestras. A Conductor sits over its
//     members; a member that is itself an Orchestra brings its own team. The
//     runtime ENFORCES it: the Conductor really directs those agents. Nobody
//     maintains these links by hand — they are the member edges.
//   • manual — a structure people declare ("this agent sits under that one")
//     that the runtime does NOT enforce. Stored as a platform.associations edge
//     agent → agent with role `org_chart`, manager = source, report = target —
//     the same direction as an Orchestra's member edge. No table of its own.

import type { OrgChartEdgeKind } from "@/components/official/org-chart/OrgChart";

/** Association role of a manual org chart link (manager → report). */
export const ORG_CHART_ROLE = "org_chart" as const;

export type AgentOrgEdgeKind = "automatic" | "manual";

export const AGENT_ORG_EDGE_KINDS: Record<AgentOrgEdgeKind, OrgChartEdgeKind> = {
  automatic: {
    label: "Automatic — Orchestra",
    description: "The Conductor directs these agents when it runs. Comes from the Orchestra itself.",
    color: "hsl(var(--primary))",
  },
  manual: {
    label: "Manual",
    description: "A structure you recorded. The agents don't act on it.",
    color: "hsl(var(--warning))",
    dashed: true,
  },
};

/** How many agent ids go into one association read. */
export const ORG_CHART_READ_CHUNK = 150;
