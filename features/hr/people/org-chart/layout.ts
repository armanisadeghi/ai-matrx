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
//     the date re-fetches; it does NOT re-lay-out from scratch (§5.2).
//
//     That is achieved by making sibling order a DETERMINISTIC FUNCTION OF THE
//     PERSON, not of the fetch: siblings sort by `sortKey` (their display name),
//     so anyone who is under the same manager on both dates lands in the same
//     relative slot on both. The alternative — remembering last render's
//     positions in state — was tried and rejected: it makes the layout depend on
//     which chart you happened to look at first, which means two people opening
//     the same URL see different charts. A pure function of the data does not
//     have that problem, needs no state, and is testable.
//
//     What MOVES is exactly what changed: someone whose manager changed slides
//     under their new manager, and the CSS transition on the node makes that
//     legible as a change rather than a redraw.

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 68;
export const NODE_GAP_X = 22;
export const LEVEL_GAP_Y = 104;

export type OrgLayoutInput = {
  /** Stable key. `employment_id` — a person may hold two spells over time. */
  id: string;
  managerId: string | null;
  /**
   * What siblings are ordered by. The display name, so a person's slot is a
   * property of the PERSON and not of which date you loaded first. See rule 2.
   */
  sortKey: string;
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
 * Lay a forest out top-down. Pure: the same input always produces the same
 * chart, on any machine, in any order of loading.
 *
 * `collapsed` is the set of node ids whose subtree is hidden.
 */
export function layoutOrgChart(args: {
  nodes: readonly OrgLayoutInput[];
  collapsed?: ReadonlySet<string>;
  dottedLines?: readonly { from: string; to: string }[];
}): OrgLayout {
  const collapsed = args.collapsed ?? new Set<string>();

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

  const byId = new Map(args.nodes.map((n) => [n.id, n]));

  // Sibling order is a property of the PEOPLE, so it survives an as-of change.
  // The id is the tie-breaker, so two people with the same name still land in a
  // stable, repeatable order.
  const orderSiblings = (ids: string[]): string[] =>
    [...ids].sort((a, b) => {
      const ka = byId.get(a)?.sortKey ?? a;
      const kb = byId.get(b)?.sortKey ?? b;
      const byKey = ka.localeCompare(kb);
      return byKey !== 0 ? byKey : a < b ? -1 : a > b ? 1 : 0;
    });
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
