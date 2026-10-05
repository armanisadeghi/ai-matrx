// features/agents/org-chart/orgChartHealth.ts
//
// The org chart's health check (pure): what needs attention, as named groups of
// boxes the chart can point at. "Serious" groups count on the toolbar button;
// the rest are worth knowing but are a normal state of a growing chart.

import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";
import type { AgentOrgNodeData } from "./buildAgentOrgForest";
import type { AgentActivity } from "./useOrgChartActivity";

export type HealthIssueId =
  | "couldnt_load"
  | "failing"
  | "stalled"
  | "loop"
  | "spread"
  | "open_position";

export interface HealthIssue {
  id: HealthIssueId;
  label: string;
  /** One line: what it means. */
  hint: string;
  serious: boolean;
  /** Chart keys (placements), in chart order. */
  keys: string[];
}

const META: Record<HealthIssueId, { label: string; hint: string; serious: boolean }> = {
  couldnt_load: { label: "Team couldn't load", hint: "An Orchestra here could not be read", serious: true },
  failing: { label: "Last run failed", hint: "The most recent run ended in an error", serious: true },
  stalled: { label: "Stalled run", hint: "Marked running, but nothing is moving", serious: true },
  loop: { label: "Loop", hint: "Sits above itself, so the chart stops there", serious: true },
  spread: { label: "Spread thin", hint: "On many teams at once", serious: true },
  open_position: { label: "Open position", hint: "A seat nobody fills yet", serious: false },
};

export function orgChartHealth(
  forest: readonly OrgChartTreeNode<AgentOrgNodeData>[],
  opts: {
    activity: Record<string, AgentActivity>;
    /** Placements at which an agent counts as spread thin (knob). Null while unknown. */
    spreadWarnAt: number | null;
    isOpenPosition: (positionId: string) => boolean;
  },
): HealthIssue[] {
  const keys = new Map<HealthIssueId, string[]>();
  const add = (id: HealthIssueId, key: string) => keys.set(id, [...(keys.get(id) ?? []), key]);

  const walk = (n: OrgChartTreeNode<AgentOrgNodeData>) => {
    const d = n.data;
    if (d.unavailable) add("couldnt_load", n.key);
    if (d.loop) add("loop", n.key);
    if (d.boxType === "agent") {
      const a = opts.activity[d.entityId];
      if (a?.state === "failed") add("failing", n.key);
      if (a?.state === "stalled") add("stalled", n.key);
      if (opts.spreadWarnAt !== null && d.otherPlacements + 1 >= opts.spreadWarnAt) add("spread", n.key);
    }
    if (d.boxType === "position" && opts.isOpenPosition(d.entityId)) add("open_position", n.key);
    n.children.forEach(walk);
  };
  forest.forEach(walk);

  return (Object.keys(META) as HealthIssueId[])
    .filter((id) => keys.has(id))
    .map((id) => ({ id, ...META[id], keys: keys.get(id) as string[] }));
}
