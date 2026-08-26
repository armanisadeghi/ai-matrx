// features/hr/people/org-chart/layout.ts
//
// The org chart's auto-layout. Pure — no React, no DOM — so the two properties
// that matter can be reasoned about and tested without a canvas:
//
//  1. 🚨 A CYCLE NEVER LOOPS THE LAYOUT. A→B→A is possible through concurrent
//     secondary assignments (SPEC-EMPLOYEES §2.2 route 11). The walk carries an
//     explicit `onPath` set and refuses to descend into a node already on the
//     current path, so the recursion terminates on any input. The server also
//     reports `cycles[]`; that drives the BADGE. This guard is what stops the
//     browser hanging even if the server ever missed one.
//
//  2. 🚨 NODES THAT PERSIST ACROSS AN AS-OF CHANGE KEEP THEIR PLACE. Changing
//     the date re-fetches; it does NOT re-lay-out from scratch (§5.2). Sibling
//     ORDER is seeded from the previous layout — anyone who was there before
//     stays in the same relative slot, and only genuinely new people are
//     appended. The change is then legible as a change instead of the whole
//     chart shuffling and the user having to re-find everyone.

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 68;
export const NODE_GAP_X = 22;
export const LEVEL_GAP_Y = 104;

export type OrgLayoutInput = {
  /** Stable key. `employment_id` — a person may hold two spells over time. */
  id: string;
  managerId: string | null;
};

export type OrgLayoutNode = {
  id: string;
  managerId: string | null;
  depth: number;
  x: number;
  y: number;
  /** Has children in the DATA, whether or not they are currently drawn. */
  hasChildren: boolean;
  childCount: number;
  /** Its subtree is collapsed, so its children are not in `nodes`. */
  collapsed: boolean;
};

export type OrgLayoutEdge = {
  from: string;
  to: string;
  /** A `hr.reporting_line` row, drawn dashed behind a toggle. */
  dotted?: boolean;
};

export type OrgLayout = {
  nodes: OrgLayoutNode[];
  edges: OrgLayoutEdge[];
  width: number;
  height: number;
  /** Manager links this walk refused to follow because they close a cycle. */
  suppressedCycleEdges: OrgLayoutEdge[];
};

/**
 * Lay a forest out top-down.
 *
 * `collapsed` is the set of node ids whose subtree is hidden. `previousOrder`
 * maps a node id to the x it had in the last layout — see property 2 above.
 */
export function layoutOrgChart(args: {
  nodes: readonly OrgLayoutInput[];
  collapsed?: ReadonlySet<string>;
  previousOrder?: ReadonlyMap<string, number>;
  dottedLines?: readonly { from: string; to: string }[];
}): OrgLayout {
  const collapsed = args.collapsed ?? new Set<string>();
  const previousOrder = args.previousOrder ?? new Map<string, number>();

  const present = new Set(args.nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of args.nodes) {
    const parent =
      node.managerId && present.has(node.managerId) && node.managerId !== node.id
        ? node.managerId
        : null;
    if (parent) {
      const list = childrenOf.get(parent);
      if (list) list.push(node.id);
      else childrenOf.set(parent, [node.id]);
    } else {
      roots.push(node.id);
    }
  }

  // Sibling order: previously-seen nodes first, in their previous left-to-right
  // order; genuinely new nodes after them, alphabetically stable by id so the
  // result is deterministic.
  const orderSiblings = (ids: string[]): string[] =>
    [...ids].sort((a, b) => {
      const pa = previousOrder.get(a);
      const pb = previousOrder.get(b);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });

  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, OrgLayoutNode>();
  const edges: OrgLayoutEdge[] = [];
  const suppressedCycleEdges: OrgLayoutEdge[] = [];

  let cursorX = 0;
  let maxDepth = 0;

  /** Returns the node's centre x. */
  const walk = (
    id: string,
    depth: number,
    onPath: Set<string>,
  ): number => {
    maxDepth = Math.max(maxDepth, depth);
    const input = byId.get(id);
    const kids = orderSiblings(childrenOf.get(id) ?? []);
    const drawKids = collapsed.has(id) ? [] : kids;

    let centre: number;
    const childCentres: number[] = [];

    onPath.add(id);
    for (const childId of drawKids) {
      // THE CYCLE GUARD. Never descend into a node already on this path.
      if (onPath.has(childId)) {
        suppressedCycleEdges.push({ from: id, to: childId });
        continue;
      }
      if (placed.has(childId)) {
        // Already drawn under a different parent (possible with a broken graph):
        // draw the edge, do not re-place the node.
        edges.push({ from: id, to: childId });
        continue;
      }
      childCentres.push(walk(childId, depth + 1, onPath));
      edges.push({ from: id, to: childId });
    }
    onPath.delete(id);

    if (childCentres.length > 0) {
      centre =
        (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
    } else {
      centre = cursorX + NODE_WIDTH / 2;
      cursorX += NODE_WIDTH + NODE_GAP_X;
    }

    placed.set(id, {
      id,
      managerId: input?.managerId ?? null,
      depth,
      x: centre - NODE_WIDTH / 2,
      y: depth * LEVEL_GAP_Y,
      hasChildren: kids.length > 0,
      childCount: kids.length,
      collapsed: collapsed.has(id) && kids.length > 0,
    });

    return centre;
  };

  for (const rootId of orderSiblings(roots)) {
    if (placed.has(rootId)) continue;
    walk(rootId, 0, new Set<string>());
    // A gap between separate trees, so two unrelated roots do not read as one.
    cursorX += NODE_GAP_X * 2;
  }

  // Anything the walk never reached (a pure cycle with no entry point) still
  // gets drawn. Nobody is silently dropped — that is the whole rule.
  for (const node of args.nodes) {
    if (placed.has(node.id)) continue;
    placed.set(node.id, {
      id: node.id,
      managerId: node.managerId,
      depth: 0,
      x: cursorX,
      y: 0,
      hasChildren: (childrenOf.get(node.id) ?? []).length > 0,
      childCount: (childrenOf.get(node.id) ?? []).length,
      collapsed: false,
    });
    cursorX += NODE_WIDTH + NODE_GAP_X;
  }

  const nodes = [...placed.values()];
  const dotted: OrgLayoutEdge[] = (args.dottedLines ?? [])
    .filter((line) => placed.has(line.from) && placed.has(line.to))
    .map((line) => ({ from: line.from, to: line.to, dotted: true }));

  const width =
    nodes.reduce((max, node) => Math.max(max, node.x + NODE_WIDTH), 0) + NODE_GAP_X;
  const height = (maxDepth + 1) * LEVEL_GAP_Y;

  return {
    nodes,
    edges: [...edges, ...dotted],
    width,
    height,
    suppressedCycleEdges,
  };
}

/** The x-order to carry into the NEXT layout, so persisting nodes keep their slot. */
export function orderFromLayout(layout: OrgLayout): Map<string, number> {
  return new Map(layout.nodes.map((node) => [node.id, node.x]));
}

/** Every ancestor of `id`, nearest first. Used by focus, which expands ancestry. */
export function ancestorsOf(
  id: string,
  managerOf: ReadonlyMap<string, string | null>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = managerOf.get(id) ?? null;
  while (current && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = managerOf.get(current) ?? null;
  }
  return out;
}
