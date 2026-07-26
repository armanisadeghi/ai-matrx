/**
 * features/marketing/content-plan/components/pillar-map/layouts.ts
 *
 * PURE layout + visibility math for the pillar map. No React, no React Flow,
 * no DOM — every function is deterministic from its inputs and unit-testable
 * (see layouts.test.ts). The map component consumes these; positions are a
 * projection of the tree, never persisted.
 *
 * Functions are generic over minimal structural types so tests never need to
 * fabricate full `PlanNodeRow` DB rows.
 */

export interface XY {
  x: number;
  y: number;
}

/** Minimal row shape the visibility helpers need. */
export interface PlanishRow {
  id: string;
  parent_id: string | null;
}

/** Minimal tree shape the layout functions need. */
export interface LayoutTreeItem {
  node: { id: string };
  children: LayoutTreeItem[];
}

// ---------------------------------------------------------------------------
// Radial orbit layout (adaptive rings)
// ---------------------------------------------------------------------------

/** Minimum arc length (px) between sibling centers on a ring. */
const RADIAL_MIN_ARC = 120;
/** Minimum radial gap (px) between consecutive rings. */
const RADIAL_MIN_RING_GAP = 260;

function countLeaves(item: LayoutTreeItem): number {
  return item.children.length === 0
    ? 1
    : item.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

/**
 * Deterministic radial layout: single root centered, children fan out on
 * concentric rings. Ring radii ADAPT to the node count on each ring so a
 * 400-node plan never piles labels on top of each other — a crowded ring
 * pushes outward until every sibling has RADIAL_MIN_ARC of arc.
 */
export function radialLayout(items: LayoutTreeItem[]): Map<string, XY> {
  const positions = new Map<string, XY>();
  if (items.length === 0) return positions;

  const singleRoot = items.length === 1;

  // Effective depth: with a single root the root is depth 0 (center) and its
  // children start at 1; with multiple roots, roots share ring 1.
  const countAtDepth: number[] = [];
  const tally = (item: LayoutTreeItem, depth: number) => {
    countAtDepth[depth] = (countAtDepth[depth] ?? 0) + 1;
    for (const child of item.children) tally(child, depth + 1);
  };
  for (const item of items) tally(item, singleRoot ? 0 : 1);

  const radii: number[] = [0];
  for (let depth = 1; depth < countAtDepth.length; depth += 1) {
    const needed =
      ((countAtDepth[depth] ?? 0) * RADIAL_MIN_ARC) / (2 * Math.PI);
    radii[depth] = Math.max(radii[depth - 1] + RADIAL_MIN_RING_GAP, needed);
  }

  const place = (
    item: LayoutTreeItem,
    depth: number,
    angleFrom: number,
    angleTo: number,
  ) => {
    const angle = (angleFrom + angleTo) / 2;
    const radius = radii[Math.min(depth, radii.length - 1)] ?? 0;
    positions.set(item.node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
    const total = countLeaves(item);
    let cursor = angleFrom;
    for (const child of item.children) {
      const share = (countLeaves(child) / total) * (angleTo - angleFrom);
      place(child, depth + 1, cursor, cursor + share);
      cursor += share;
    }
  };

  if (singleRoot) {
    const root = items[0];
    positions.set(root.node.id, { x: 0, y: 0 });
    const total = countLeaves(root);
    let cursor = -Math.PI / 2;
    for (const child of root.children) {
      const share = (countLeaves(child) / total) * Math.PI * 2;
      place(child, 1, cursor, cursor + share);
      cursor += share;
    }
    return positions;
  }

  const totalLeaves = items.reduce((sum, item) => sum + countLeaves(item), 0) || 1;
  let cursor = -Math.PI / 2;
  for (const item of items) {
    const share = (countLeaves(item) / totalLeaves) * Math.PI * 2;
    place(item, 1, cursor, cursor + share);
    cursor += share;
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Tidy hierarchical tree layout (left → right, layered)
// ---------------------------------------------------------------------------

const TREE_COL_GAP = 260;
const TREE_ROW_GAP = 72;
const TREE_ROOT_GAP = 1; // extra rows between separate roots

/**
 * Tidy layered tree, left-to-right: each leaf takes the next row; each
 * internal node centers on the midpoint of its first and last child (the
 * classic cluster/tidy dendrogram rule — no crossings, compact, deterministic).
 */
export function tidyTreeLayout(items: LayoutTreeItem[]): Map<string, XY> {
  const positions = new Map<string, XY>();
  let leafRow = 0;

  const place = (item: LayoutTreeItem, depth: number): number => {
    let y: number;
    if (item.children.length === 0) {
      y = leafRow * TREE_ROW_GAP;
      leafRow += 1;
    } else {
      const childYs = item.children.map((child) => place(child, depth + 1));
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    positions.set(item.node.id, { x: depth * TREE_COL_GAP, y });
    return y;
  };

  for (const item of items) {
    place(item, 0);
    leafRow += TREE_ROOT_GAP;
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Grouped layout (pillars as columns, subtrees as compact grids)
// ---------------------------------------------------------------------------

const GROUP_CELL_W = 170;
const GROUP_CELL_H = 82;
const GROUP_GRID_COLS = 4;
const GROUP_COL_GAP = 110;
const GROUP_HEAD_H = 110;
const GROUP_SECTION_GAP = 28;
const GROUP_ROOT_DROP = 170;

function flattenSubtree(item: LayoutTreeItem): LayoutTreeItem[] {
  return [item, ...item.children.flatMap(flattenSubtree)];
}

/**
 * Grouped/clustered layout: each pillar is a column; inside a column each
 * cluster is a section header with its whole subtree wrapped into a compact
 * GROUP_GRID_COLS-wide grid beneath it. A single root (home) sits centered
 * above the columns. Reads like a sitemap board — compact at 400+ nodes.
 */
export function groupedLayout(items: LayoutTreeItem[]): Map<string, XY> {
  const positions = new Map<string, XY>();
  if (items.length === 0) return positions;

  let rootItem: LayoutTreeItem | null = null;
  let columns = items;
  if (items.length === 1 && items[0].children.length > 0) {
    rootItem = items[0];
    columns = items[0].children;
  }

  const colWidth = GROUP_GRID_COLS * GROUP_CELL_W;
  let x0 = 0;
  for (const column of columns) {
    let y = rootItem ? GROUP_ROOT_DROP : 0;
    positions.set(column.node.id, { x: x0 + colWidth / 2, y });
    y += GROUP_HEAD_H;

    for (const section of column.children) {
      positions.set(section.node.id, { x: x0, y });
      y += GROUP_CELL_H;
      const rest = flattenSubtree(section).slice(1);
      rest.forEach((item, index) => {
        positions.set(item.node.id, {
          x: x0 + (index % GROUP_GRID_COLS) * GROUP_CELL_W,
          y: y + Math.floor(index / GROUP_GRID_COLS) * GROUP_CELL_H,
        });
      });
      y += Math.ceil(rest.length / GROUP_GRID_COLS) * GROUP_CELL_H;
      y += GROUP_SECTION_GAP;
    }
    x0 += colWidth + GROUP_COL_GAP;
  }

  if (rootItem) {
    positions.set(rootItem.node.id, {
      x: Math.max(0, (x0 - GROUP_COL_GAP) / 2),
      y: 0,
    });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Visibility: filter with ancestor retention + collapse
// ---------------------------------------------------------------------------

/**
 * Keep every row matching the predicate PLUS its ancestors (so the tree never
 * shatters into orphans when a filter is active). Non-matching ancestors come
 * back in `dimmed` — the map renders them faded but still actionable.
 */
export function filterWithAncestors<T extends PlanishRow>(
  rows: T[],
  matches: (row: T) => boolean,
): { rows: T[]; dimmed: Set<string> } {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.id, row);

  const keep = new Set<string>();
  const matched = new Set<string>();
  for (const row of rows) {
    if (!matches(row)) continue;
    matched.add(row.id);
    let cursor: T | undefined = row;
    while (cursor && !keep.has(cursor.id)) {
      keep.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
  }

  const dimmed = new Set<string>();
  for (const id of keep) if (!matched.has(id)) dimmed.add(id);
  return { rows: rows.filter((row) => keep.has(row.id)), dimmed };
}

/**
 * Remove the descendants of every collapsed id, and report how many rows each
 * visible collapsed node is hiding (its count badge). A collapsed id nested
 * inside another collapsed subtree simply stays hidden.
 */
export function collapseVisible<T extends PlanishRow>(
  rows: T[],
  collapsed: ReadonlySet<string>,
): { rows: T[]; hiddenCounts: Map<string, number> } {
  const hiddenCounts = new Map<string, number>();
  if (collapsed.size === 0) return { rows, hiddenCounts };

  const childrenByParent = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const siblings = childrenByParent.get(row.parent_id);
    if (siblings) siblings.push(row);
    else childrenByParent.set(row.parent_id, [row]);
  }

  const hidden = new Set<string>();
  const hideSubtree = (id: string): number => {
    let count = 0;
    for (const child of childrenByParent.get(id) ?? []) {
      hidden.add(child.id);
      count += 1 + hideSubtree(child.id);
    }
    return count;
  };

  for (const id of collapsed) {
    if (!rows.some((row) => row.id === id)) continue;
    hiddenCounts.set(id, hideSubtree(id));
  }
  // A collapsed node hidden by an outer collapse contributes no badge.
  for (const id of hiddenCounts.keys()) {
    if (hidden.has(id)) hiddenCounts.delete(id);
  }
  return { rows: rows.filter((row) => !hidden.has(row.id)), hiddenCounts };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Middle-truncate for CANVAS labels only (full label lives in the tooltip and
 * the node panel): keeps the start and the end, which is where plan labels
 * carry their meaning ("Copper Wire Recycling … Los Angeles").
 */
export function middleTruncate(text: string, max = 26): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
