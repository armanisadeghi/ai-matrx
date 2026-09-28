// components/official/org-chart/layout.ts
//
// Pure tree layout for <OrgChart>. No React, no DOM — every position the chart
// draws comes from here, so it is unit-tested on its own.
//
// The core subtree-width algorithm (each subtree is as wide as its children
// laid side by side; a parent is centred over them) is adapted from Paperclip's
// org chart, ui/src/pages/OrgChart.tsx:
//   Copyright (c) 2025 Paperclip AI — MIT License
//   https://github.com/paperclipai/paperclip
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software ... subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//   WITHOUT WARRANTY OF ANY KIND.
//
// What this adds on top of it:
//   • collapse — a collapsed node lays out as a leaf and reports how many
//     people sit under it, so the chart can show "12 hidden" on the toggle;
//   • stacked teams — a node whose visible children are ALL leaves, and are
//     many, hangs them in two columns off a central trunk (the classic printed
//     org-chart shape) instead of one row thousands of pixels wide;
//   • typed edges — every edge carries the kind of the link it draws, so the
//     chart can colour automatic and manual links differently;
//   • rounded orthogonal connectors.

export interface OrgChartTreeNode<T> {
  /** Unique per APPEARANCE in the tree (the same record may appear twice). */
  key: string;
  /** Kind of the link from this node's parent (null for a root). */
  edgeKind: string | null;
  data: T;
  children: OrgChartTreeNode<T>[];
}

export interface OrgChartLayoutOptions {
  cardWidth: number;
  cardHeight: number;
  /** Horizontal gap between sibling subtrees. */
  gapX: number;
  /** Vertical gap between a parent and its children's row. */
  gapY: number;
  /** Outer margin around the whole forest. */
  padding: number;
  /** Keys whose children are hidden. */
  collapsed: ReadonlySet<string>;
  /**
   * A node whose visible children are all leaves stacks them in two columns
   * once there are at least this many. Infinity disables stacking.
   */
  stackThreshold: number;
  /** Vertical gap between stacked rows. */
  stackGapY: number;
  /** Width of the trunk channel between the two stacked columns. */
  stackTrunkGap: number;
  /**
   * Target width/height ratio for the whole forest. Separate trees wrap into
   * rows to approach it, so a chart of many small trees fits a screen at a
   * readable zoom instead of one endless strip. Omit for a single row.
   */
  targetAspect?: number;
}

export const DEFAULT_ORG_CHART_LAYOUT: Omit<OrgChartLayoutOptions, "collapsed"> = {
  cardWidth: 240,
  cardHeight: 112,
  gapX: 32,
  gapY: 72,
  padding: 60,
  stackThreshold: 5,
  stackGapY: 18,
  stackTrunkGap: 56,
};

export interface PlacedOrgNode<T> {
  key: string;
  x: number;
  y: number;
  depth: number;
  parentKey: string | null;
  edgeKind: string | null;
  node: OrgChartTreeNode<T>;
  /** Direct children (visible or not). */
  childCount: number;
  /** Every descendant, visible or not. */
  descendantCount: number;
  collapsed: boolean;
}

export interface PlacedOrgEdge {
  key: string;
  fromKey: string;
  toKey: string;
  kind: string | null;
  /** SVG path data, rounded orthogonal connector. */
  d: string;
}

export interface OrgChartLayout<T> {
  nodes: PlacedOrgNode<T>[];
  edges: PlacedOrgEdge[];
  width: number;
  height: number;
}

export function countDescendants<T>(node: OrgChartTreeNode<T>): number {
  let n = 0;
  for (const c of node.children) n += 1 + countDescendants(c);
  return n;
}

function visibleChildren<T>(node: OrgChartTreeNode<T>, o: OrgChartLayoutOptions) {
  return o.collapsed.has(node.key) ? [] : node.children;
}

function isStacked<T>(node: OrgChartTreeNode<T>, o: OrgChartLayoutOptions): boolean {
  const kids = visibleChildren(node, o);
  return (
    kids.length >= o.stackThreshold &&
    kids.every((k) => visibleChildren(k, o).length === 0)
  );
}

/** Width a subtree needs. */
function subtreeWidth<T>(node: OrgChartTreeNode<T>, o: OrgChartLayoutOptions): number {
  const kids = visibleChildren(node, o);
  if (kids.length === 0) return o.cardWidth;
  if (isStacked(node, o)) return Math.max(o.cardWidth, 2 * o.cardWidth + o.stackTrunkGap);
  const childrenW = kids.reduce((sum, c) => sum + subtreeWidth(c, o), 0);
  return Math.max(o.cardWidth, childrenW + (kids.length - 1) * o.gapX);
}

/** Height a subtree needs (cards + gaps down to its deepest visible row). */
function subtreeHeight<T>(node: OrgChartTreeNode<T>, o: OrgChartLayoutOptions): number {
  const kids = visibleChildren(node, o);
  if (kids.length === 0) return o.cardHeight;
  if (isStacked(node, o)) {
    const rows = Math.ceil(kids.length / 2);
    return o.cardHeight + o.gapY * 0.75 + rows * o.cardHeight + (rows - 1) * o.stackGapY;
  }
  return o.cardHeight + o.gapY + Math.max(...kids.map((k) => subtreeHeight(k, o)));
}

/**
 * Orthogonal polyline through `pts` with each corner rounded by up to `r`
 * (shrunk when a segment is too short for the full radius).
 */
export function roundedPath(pts: Array<[number, number]>, r = 10): string {
  if (pts.length === 0) return "";
  const [x0, y0] = pts[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    if (rr <= 0.5) {
      d += ` L ${cx} ${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * rr;
    const ay = cy - ((cy - py) / inLen) * rr;
    const bx = cx + ((nx - cx) / outLen) * rr;
    const by = cy + ((ny - cy) / outLen) * rr;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  d += ` L ${lx} ${ly}`;
  return d;
}

export function layoutOrgForest<T>(
  roots: OrgChartTreeNode<T>[],
  o: OrgChartLayoutOptions,
): OrgChartLayout<T> {
  const nodes: PlacedOrgNode<T>[] = [];
  const edges: PlacedOrgEdge[] = [];
  const W = o.cardWidth;
  const H = o.cardHeight;

  function place(
    node: OrgChartTreeNode<T>,
    x: number,
    y: number,
    depth: number,
    parentKey: string | null,
  ): PlacedOrgNode<T> {
    const totalW = subtreeWidth(node, o);
    const placed: PlacedOrgNode<T> = {
      key: node.key,
      x: x + (totalW - W) / 2,
      y,
      depth,
      parentKey,
      edgeKind: node.edgeKind,
      node,
      childCount: node.children.length,
      descendantCount: countDescendants(node),
      collapsed: o.collapsed.has(node.key) && node.children.length > 0,
    };
    nodes.push(placed);

    const kids = visibleChildren(node, o);
    if (kids.length === 0) return placed;

    const px = placed.x + W / 2;
    const py = y + H;

    if (isStacked(node, o)) {
      // Two columns hanging off a central trunk.
      const trunkX = x + totalW / 2;
      const leftX = trunkX - o.stackTrunkGap / 2 - W;
      const rightX = trunkX + o.stackTrunkGap / 2;
      const top = y + H + o.gapY * 0.75;
      kids.forEach((kid, i) => {
        const row = Math.floor(i / 2);
        const left = i % 2 === 0;
        const cy = top + row * (H + o.stackGapY);
        // Every stacked child is a visible leaf, so its subtree width is W and
        // place() puts it exactly at the x given.
        place(kid, left ? leftX : rightX, cy, depth + 1, node.key);
        const midY = cy + H / 2;
        const endX = left ? leftX + W : rightX;
        edges.push({
          key: `${node.key}->${kid.key}`,
          fromKey: node.key,
          toKey: kid.key,
          kind: kid.edgeKind,
          d: roundedPath([
            [px, py],
            [trunkX, py],
            [trunkX, midY],
            [endX, midY],
          ]),
        });
      });
      return placed;
    }

    const childrenW = kids.reduce((sum, c) => sum + subtreeWidth(c, o), 0);
    const gaps = (kids.length - 1) * o.gapX;
    let cx = x + (totalW - childrenW - gaps) / 2;
    const childY = y + H + o.gapY;
    const midY = py + o.gapY / 2;
    for (const kid of kids) {
      const cw = subtreeWidth(kid, o);
      const child = place(kid, cx, childY, depth + 1, node.key);
      const tx = child.x + W / 2;
      edges.push({
        key: `${node.key}->${kid.key}`,
        fromKey: node.key,
        toKey: kid.key,
        kind: kid.edgeKind,
        d: roundedPath([
          [px, py],
          [px, midY],
          [tx, midY],
          [tx, childY],
        ]),
      });
      cx += cw + o.gapX;
    }
    return placed;
  }

  // Pack separate trees into rows, in the order given (callers put the biggest first).
  const sized = roots.map((root) => ({ root, w: subtreeWidth(root, o), h: subtreeHeight(root, o) }));
  const gap = o.gapX * 2;
  const totalArea = sized.reduce((a, t) => a + (t.w + gap) * (t.h + o.gapY), 0);
  const widest = sized.reduce((m, t) => Math.max(m, t.w), 0);
  const rowLimit =
    o.targetAspect && sized.length > 1
      ? Math.max(widest, Math.sqrt(totalArea * o.targetAspect))
      : Infinity;
  let x = o.padding;
  let y = o.padding;
  let rowH = 0;
  for (const t of sized) {
    if (x > o.padding && x + t.w - o.padding > rowLimit) {
      x = o.padding;
      y += rowH + o.gapY * 1.5;
      rowH = 0;
    }
    place(t.root, x, y, 0, null);
    x += t.w + gap;
    rowH = Math.max(rowH, t.h);
  }

  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + W);
    maxY = Math.max(maxY, n.y + H);
  }
  return {
    nodes,
    edges,
    width: nodes.length ? maxX + o.padding : 0,
    height: nodes.length ? maxY + o.padding : 0,
  };
}

/** Every key in the forest that has children (for "collapse all"). */
export function collectParentKeys<T>(roots: OrgChartTreeNode<T>[]): string[] {
  const out: string[] = [];
  const walk = (n: OrgChartTreeNode<T>) => {
    if (n.children.length) out.push(n.key);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** Keys of `key`'s ancestors, root first (for "reveal this node"). */
export function ancestorKeys<T>(roots: OrgChartTreeNode<T>[], key: string): string[] | null {
  const path: string[] = [];
  const walk = (n: OrgChartTreeNode<T>): boolean => {
    if (n.key === key) return true;
    path.push(n.key);
    for (const c of n.children) if (walk(c)) return true;
    path.pop();
    return false;
  };
  for (const r of roots) if (walk(r)) return path;
  return null;
}
