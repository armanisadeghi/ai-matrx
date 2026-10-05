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
import type { OrgLinkKind, RecordedLinkKind } from "./constants";
import { ORG_LINK_KIND_META, boxId, parseBoxId, type OrgBoxType } from "./constants";

export interface OrchestraShape {
  members: Array<{ agentId: string; roleTitle: string | null }>;
  accent?: OrchestraAccent;
  mode?: OrchestraMode;
}

/**
 * One recorded link. For a tree link (reports_to) `managerId` is the box above
 * and `reportId` the box below; for a cross link it is from → to.
 */
export interface ManualOrgEdge {
  edgeId: string;
  managerId: string;
  reportId: string;
  kind: RecordedLinkKind;
}

/** A hand-off or dotted line, drawn as an arrow across the tree. */
export interface AgentCrossLink {
  edgeId: string;
  fromId: string;
  toId: string;
  kind: RecordedLinkKind;
}

/** The cross links among recorded edges (everything that is not a tree link). */
export function crossLinksOf(manualEdges: readonly ManualOrgEdge[]): AgentCrossLink[] {
  return manualEdges
    .filter((e) => !ORG_LINK_KIND_META[e.kind].tree)
    .map((e) => ({ edgeId: e.edgeId, fromId: e.managerId, toId: e.reportId, kind: e.kind }));
}

export interface AgentOrgNodeData {
  /** `type:entityId` — unique per box on the chart. */
  boxId: string;
  boxType: OrgBoxType;
  /** The agent / user / team / position id. */
  entityId: string;
  /** Kind of the link from its parent; null at a root. */
  edgeKind: OrgLinkKind | null;
  /** The box id this appearance hangs under. */
  parentId: string | null;
  /** Role title inside the parent Orchestra (automatic links only). */
  roleTitle: string | null;
  /** This agent leads an Orchestra. */
  isConductor: boolean;
  accent?: OrchestraAccent;
  mode?: OrchestraMode;
  /** Its own Orchestra has members that have not loaded yet. */
  pending: boolean;
  /** Its own Orchestra could not be loaded (no access, or it no longer exists). */
  unavailable: boolean;
  /** How many OTHER parents this agent also sits under. */
  otherPlacements: number;
  /** The link back to an ancestor closed a loop; the tree stops here. */
  loop: boolean;
}

export interface BuildAgentOrgForestInput {
  /** Loaded Orchestras by Conductor AGENT id (plain ids; boxes are derived). */
  orchestras: ReadonlyMap<string, OrchestraShape>;
  /** Every agent known to lead an Orchestra (loaded or not). */
  conductorIds: ReadonlySet<string>;
  /** Conductors whose Orchestra failed to load. */
  failedIds?: ReadonlySet<string>;
  manualEdges: readonly ManualOrgEdge[];
  /** Build only from these BOX ids (e.g. one Orchestra). Omit for the whole chart. */
  rootIds?: readonly string[];
  /** Used to order roots and manual reports (takes a box id); defaults to the id. */
  nameOf?: (boxId: string) => string;
  /** Extra boxes that belong on the chart even with no links (e.g. every position). */
  standalone?: readonly string[];
}

interface ChildLink {
  /** Box id of the child. */
  bid: string;
  kind: OrgLinkKind;
  roleTitle: string | null;
}

export function buildAgentOrgForest(input: BuildAgentOrgForestInput): OrgChartTreeNode<AgentOrgNodeData>[] {
  const { manualEdges, rootIds } = input;
  // Orchestra inputs are keyed by plain agent ids; everything inside is box ids.
  const orchestras = new Map<string, OrchestraShape>();
  for (const [id, o] of input.orchestras) orchestras.set(boxId("agent", id), o);
  const conductorIds = new Set([...input.conductorIds].map((id) => boxId("agent", id)));
  const failedIds = new Set([...(input.failedIds ?? [])].map((id) => boxId("agent", id)));
  const nameOf = input.nameOf ?? ((id: string) => id);

  // children + parent counts over BOTH kinds
  const childrenOf = new Map<string, ChildLink[]>();
  const parentsOf = new Map<string, Set<string>>();
  const all = new Set<string>();

  const link = (parent: string, child: ChildLink) => {
    all.add(parent);
    all.add(child.bid);
    const list = childrenOf.get(parent) ?? [];
    // One link per (parent, child): an automatic link wins over a manual copy of it.
    if (list.some((c) => c.bid === child.bid)) return;
    list.push(child);
    childrenOf.set(parent, list);
    const ps = parentsOf.get(child.bid) ?? new Set<string>();
    ps.add(parent);
    parentsOf.set(child.bid, ps);
  };

  for (const [conductorId, o] of orchestras) {
    all.add(conductorId);
    for (const m of o.members) {
      link(conductorId, { bid: boxId("agent", m.agentId), kind: "directs", roleTitle: m.roleTitle });
    }
  }
  const manualSorted = [...manualEdges].sort((a, b) =>
    nameOf(a.reportId).localeCompare(nameOf(b.reportId)),
  );
  for (const e of manualSorted) {
    if (ORG_LINK_KIND_META[e.kind].tree) {
      link(e.managerId, { bid: e.reportId, kind: e.kind, roleTitle: null });
    } else {
      // Cross links don't place a box, but both ends belong on the chart.
      all.add(e.managerId);
      all.add(e.reportId);
    }
  }
  for (const id of conductorIds) all.add(id);
  for (const id of input.standalone ?? []) all.add(id);

  const visited = new Set<string>();

  const build = (
    bid: string,
    key: string,
    parent: { id: string; link: ChildLink } | null,
    path: ReadonlySet<string>,
  ): OrgChartTreeNode<AgentOrgNodeData> => {
    visited.add(bid);
    const o = orchestras.get(bid);
    const isConductor = conductorIds.has(bid) || orchestras.has(bid);
    const loop = path.has(bid);
    const parentCount = parentsOf.get(bid)?.size ?? 0;
    const { type: boxType, id: entityId } = parseBoxId(bid);
    const data: AgentOrgNodeData = {
      boxId: bid,
      boxType,
      entityId,
      edgeKind: parent?.link.kind ?? null,
      parentId: parent?.id ?? null,
      roleTitle: parent?.link.roleTitle ?? null,
      isConductor,
      accent: o?.accent,
      mode: o?.mode,
      pending: isConductor && !o && !failedIds.has(bid),
      unavailable: !o && failedIds.has(bid),
      otherPlacements: Math.max(0, parentCount - (parent ? 1 : 0)),
      loop,
    };
    if (loop) return { key, edgeKind: data.edgeKind, data, children: [] };
    const nextPath = new Set(path).add(bid);
    const children = (childrenOf.get(bid) ?? []).map((c) =>
      build(c.bid, `${key}/${c.bid}`, { id: bid, link: c }, nextPath),
    );
    return { key, edgeKind: data.edgeKind, data, children };
  };

  if (rootIds) {
    return rootIds.map((id) => build(id, id, null, new Set()));
  }

  const sizes = new Map<string, number>();
  const size = (id: string): number => {
    const known = sizes.get(id);
    if (known !== undefined) return known;
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const c of childrenOf.get(cur) ?? []) {
        if (!seen.has(c.bid) && c.bid !== id) {
          seen.add(c.bid);
          stack.push(c.bid);
        }
      }
    }
    sizes.set(id, seen.size);
    return seen.size;
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
