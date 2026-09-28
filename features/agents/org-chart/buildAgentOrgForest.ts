// features/agents/org-chart/buildAgentOrgForest.ts
//
// Pure: turns Orchestras (automatic links) + recorded manual links into the
// forest <OrgChart> draws. One function for every agent org chart — the
// Orchestra builder's nested view and the full /agents/org-chart page both use
// it, so a nested Orchestra looks the same wherever it appears.
//
// The graph is not a tree: one agent can be a member of several Orchestras, or
// sit in one and also be placed under someone by hand. It appears under every
// parent, and each appearance says how many other places it holds. A loop
// (A under B under A) is cut where it closes and the card says so — never an
// infinite tree, never a silently dropped agent.

import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";
import type { OrchestraAccent, OrchestraMode } from "@/features/agents/orchestras/constants";
import type { AgentOrgEdgeKind } from "./constants";

export interface OrchestraShape {
  members: Array<{ agentId: string; roleTitle: string | null }>;
  accent?: OrchestraAccent;
  mode?: OrchestraMode;
}

export interface ManualOrgEdge {
  edgeId: string;
  managerId: string;
  reportId: string;
}

export interface AgentOrgNodeData {
  agentId: string;
  /** Kind of the link from its parent; null at a root. */
  edgeKind: AgentOrgEdgeKind | null;
  /** The parent this appearance hangs under. */
  parentId: string | null;
  /** Role title inside the parent Orchestra (automatic links only). */
  roleTitle: string | null;
  /** This agent leads an Orchestra. */
  isConductor: boolean;
  accent?: OrchestraAccent;
  mode?: OrchestraMode;
  /** Its own Orchestra has members that have not loaded yet. */
  pending: boolean;
  /** How many OTHER parents this agent also sits under. */
  otherPlacements: number;
  /** The link back to an ancestor closed a loop; the tree stops here. */
  loop: boolean;
}

export interface BuildAgentOrgForestInput {
  /** Loaded Orchestras by Conductor id. */
  orchestras: ReadonlyMap<string, OrchestraShape>;
  /** Every agent known to lead an Orchestra (loaded or not). */
  conductorIds: ReadonlySet<string>;
  manualEdges: readonly ManualOrgEdge[];
  /** Build only from these roots (e.g. one Orchestra). Omit for the whole chart. */
  rootIds?: readonly string[];
  /** Used to order roots and manual reports; defaults to the id. */
  nameOf?: (agentId: string) => string;
}

interface ChildLink {
  agentId: string;
  kind: AgentOrgEdgeKind;
  roleTitle: string | null;
}

export function buildAgentOrgForest(input: BuildAgentOrgForestInput): OrgChartTreeNode<AgentOrgNodeData>[] {
  const { orchestras, conductorIds, manualEdges, rootIds } = input;
  const nameOf = input.nameOf ?? ((id: string) => id);

  // children + parent counts over BOTH kinds
  const childrenOf = new Map<string, ChildLink[]>();
  const parentsOf = new Map<string, Set<string>>();
  const all = new Set<string>();

  const link = (parent: string, child: ChildLink) => {
    all.add(parent);
    all.add(child.agentId);
    const list = childrenOf.get(parent) ?? [];
    // One link per (parent, child): an automatic link wins over a manual copy of it.
    if (list.some((c) => c.agentId === child.agentId)) return;
    list.push(child);
    childrenOf.set(parent, list);
    const ps = parentsOf.get(child.agentId) ?? new Set<string>();
    ps.add(parent);
    parentsOf.set(child.agentId, ps);
  };

  for (const [conductorId, o] of orchestras) {
    all.add(conductorId);
    for (const m of o.members) {
      link(conductorId, { agentId: m.agentId, kind: "automatic", roleTitle: m.roleTitle });
    }
  }
  const manualSorted = [...manualEdges].sort((a, b) =>
    nameOf(a.reportId).localeCompare(nameOf(b.reportId)),
  );
  for (const e of manualSorted) {
    link(e.managerId, { agentId: e.reportId, kind: "manual", roleTitle: null });
  }
  for (const id of conductorIds) all.add(id);

  const visited = new Set<string>();

  const build = (
    agentId: string,
    key: string,
    parent: { id: string; link: ChildLink } | null,
    path: ReadonlySet<string>,
  ): OrgChartTreeNode<AgentOrgNodeData> => {
    visited.add(agentId);
    const o = orchestras.get(agentId);
    const isConductor = conductorIds.has(agentId) || orchestras.has(agentId);
    const loop = path.has(agentId);
    const parentCount = parentsOf.get(agentId)?.size ?? 0;
    const data: AgentOrgNodeData = {
      agentId,
      edgeKind: parent?.link.kind ?? null,
      parentId: parent?.id ?? null,
      roleTitle: parent?.link.roleTitle ?? null,
      isConductor,
      accent: o?.accent,
      mode: o?.mode,
      pending: isConductor && !o,
      otherPlacements: Math.max(0, parentCount - (parent ? 1 : 0)),
      loop,
    };
    if (loop) return { key, edgeKind: data.edgeKind, data, children: [] };
    const nextPath = new Set(path).add(agentId);
    const children = (childrenOf.get(agentId) ?? []).map((c) =>
      build(c.agentId, `${key}/${c.agentId}`, { id: agentId, link: c }, nextPath),
    );
    return { key, edgeKind: data.edgeKind, data, children };
  };

  if (rootIds) {
    return rootIds.map((id) => build(id, id, null, new Set()));
  }

  const size = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return (childrenOf.get(id) ?? []).reduce((n, c) => n + 1 + size(c.agentId, seen), 0);
  };
  const byWeight = (a: string, b: string) =>
    size(b) - size(a) || nameOf(a).localeCompare(nameOf(b));

  const roots = [...all].filter((id) => (parentsOf.get(id)?.size ?? 0) === 0).sort(byWeight);
  const forest = roots.map((id) => build(id, id, null, new Set()));

  // Agents that only sit inside a loop have no parentless entry point. Start a
  // tree at the first one left over until everyone is on the chart.
  for (const id of [...all].sort(byWeight)) {
    if (!visited.has(id)) forest.push(build(id, id, null, new Set()));
  }
  return forest;
}

/**
 * True when making `managerId` the manager of `reportId` would close a loop —
 * `managerId` already sits somewhere under `reportId` (by either kind of link).
 */
export function wouldCreateLoop(
  input: Pick<BuildAgentOrgForestInput, "orchestras" | "manualEdges">,
  managerId: string,
  reportId: string,
): boolean {
  if (managerId === reportId) return true;
  const kids = new Map<string, string[]>();
  const add = (p: string, c: string) => kids.set(p, [...(kids.get(p) ?? []), c]);
  for (const [cid, o] of input.orchestras) o.members.forEach((m) => add(cid, m.agentId));
  for (const e of input.manualEdges) add(e.managerId, e.reportId);
  const stack = [reportId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === managerId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return false;
}
