/**
 * features/marketing/content-plan/lib/tree-view.ts
 *
 * Pure list-management helpers for the plan tree AND site-map views:
 * client-side search/filter predicates, sibling-level sorting (never flattens
 * the hierarchy), collapse-to-level targeting, descendant counts, the shared
 * ancestor-keeping filter (`filterWithAncestors`) and collapse projection
 * (`collapseVisible`). All of it operates on already-loaded `plan.node`
 * rows — no queries, no side effects.
 */
import type { PlanNodeRow, PlanNodeTreeItem, PlanNodeType } from "../types";

// ─── Filters ───────────────────────────────────────────────────────────────

export type KeywordCoverageFilter = "any" | "has" | "missing";

export interface TreeFilters {
  /** Selected `plan_status` category ids. Empty = any status. */
  statusIds: readonly string[];
  /** Selected node types. Empty = any type. */
  nodeTypes: readonly PlanNodeType[];
  keyword: KeywordCoverageFilter;
  /** True = only nodes flagged `needs_reviewer`. */
  needsReviewer: boolean;
}

export const EMPTY_TREE_FILTERS: TreeFilters = {
  statusIds: [],
  nodeTypes: [],
  keyword: "any",
  needsReviewer: false,
};

/** How many filter controls the user has actively set (for the badge). */
export function countActiveTreeFilters(filters: TreeFilters): number {
  return (
    (filters.statusIds.length > 0 ? 1 : 0) +
    (filters.nodeTypes.length > 0 ? 1 : 0) +
    (filters.keyword !== "any" ? 1 : 0) +
    (filters.needsReviewer ? 1 : 0)
  );
}

/**
 * Does a node match the toolbar's search + filters? Search is
 * case-insensitive over label, route, and slug.
 */
export function nodeMatchesTreeQuery(
  node: PlanNodeRow,
  filters: TreeFilters,
  searchLower: string,
): boolean {
  if (
    filters.statusIds.length > 0 &&
    !filters.statusIds.includes(node.status_id ?? "")
  ) {
    return false;
  }
  if (
    filters.nodeTypes.length > 0 &&
    !filters.nodeTypes.includes(node.node_type as PlanNodeType)
  ) {
    return false;
  }
  if (filters.keyword === "has" && node.primary_keyword_id == null) {
    return false;
  }
  if (filters.keyword === "missing" && node.primary_keyword_id != null) {
    return false;
  }
  if (filters.needsReviewer && node.needs_reviewer !== true) return false;
  if (searchLower) {
    const haystack =
      `${node.label}\n${node.route ?? ""}\n${node.slug ?? ""}`.toLowerCase();
    if (!haystack.includes(searchLower)) return false;
  }
  return true;
}

// ─── Sibling-level sorting ─────────────────────────────────────────────────

/**
 * Sort modes for the tree. Every mode reorders SIBLINGS within their parent —
 * the hierarchy itself never flattens. "tree" is the natural route order that
 * `buildPlanTree` already produces.
 */
export type TreeSortMode = "tree" | "label" | "priority" | "status" | "updated";

export const TREE_SORT_MODES: readonly {
  id: TreeSortMode;
  label: string;
}[] = [
  { id: "tree", label: "Tree order" },
  { id: "label", label: "Label A–Z" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
  { id: "updated", label: "Recently updated" },
];

function routeTiebreak(a: PlanNodeRow, b: PlanNodeRow): number {
  return (
    (a.route ?? "").localeCompare(b.route ?? "") ||
    a.label.localeCompare(b.label)
  );
}

/**
 * Recursively re-sort siblings in place (the tree is rebuilt fresh per render
 * pass, so in-place is safe). `statusOrderById` maps status_id → pipeline
 * index (the `plan_status` category list order); unknown/unset statuses sort
 * last, as do null priorities.
 */
export function sortPlanTreeSiblings(
  items: PlanNodeTreeItem[],
  mode: TreeSortMode,
  statusOrderById: ReadonlyMap<string, number>,
): PlanNodeTreeItem[] {
  if (mode === "tree") return items; // buildPlanTree already route-ordered

  const compare = (a: PlanNodeTreeItem, b: PlanNodeTreeItem): number => {
    const na = a.node;
    const nb = b.node;
    switch (mode) {
      case "label":
        return na.label.localeCompare(nb.label) || routeTiebreak(na, nb);
      case "priority": {
        // 1 = highest priority first; nulls last.
        const pa = na.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = nb.priority ?? Number.MAX_SAFE_INTEGER;
        return pa - pb || routeTiebreak(na, nb);
      }
      case "status": {
        const sa = statusOrderById.get(na.status_id ?? "");
        const sb = statusOrderById.get(nb.status_id ?? "");
        return (
          (sa ?? Number.MAX_SAFE_INTEGER) - (sb ?? Number.MAX_SAFE_INTEGER) ||
          routeTiebreak(na, nb)
        );
      }
      case "updated": {
        // Most recently updated first; missing timestamps last.
        const ua = na.updated_at ?? "";
        const ub = nb.updated_at ?? "";
        if (ua !== ub) return ua > ub ? -1 : 1;
        return routeTiebreak(na, nb);
      }
    }
  };

  const walk = (siblings: PlanNodeTreeItem[]) => {
    siblings.sort(compare);
    for (const item of siblings) walk(item.children);
  };
  walk(items);
  return items;
}

// ─── Collapse levels ───────────────────────────────────────────────────────

/**
 * Level presets: "pillars" is THE top-level overview (home + first-tier
 * pages, with every expandable first-tier page collapsed); "clusters" opens
 * one level deeper; "all" expands everything. Home is the permanent tree
 * root and is never a collapse target.
 */
export type TreeLevel = "pillars" | "clusters" | "all";

/**
 * Which node ids to put in the collapsed set for a level preset. Depth is
 * VISUAL tree depth (position in the built tree), not the DB `depth` column —
 * a plan whose pillars are roots (no home node) still collapses correctly.
 */
export function collapseTargetsForLevel(
  items: PlanNodeTreeItem[],
  level: TreeLevel,
): Set<string> {
  const targets = new Set<string>();
  if (level === "all") return targets;

  // Find the visual depth pillars/clusters actually live at.
  let pillarDepth: number | null = null;
  let clusterDepth: number | null = null;
  const scan = (siblings: PlanNodeTreeItem[], depth: number) => {
    for (const item of siblings) {
      if (item.node.node_type === "pillar") {
        pillarDepth =
          pillarDepth === null ? depth : Math.min(pillarDepth, depth);
      }
      if (item.node.node_type === "cluster") {
        clusterDepth =
          clusterDepth === null ? depth : Math.min(clusterDepth, depth);
      }
      scan(item.children, depth + 1);
    }
  };
  scan(items, 0);

  const resolvedPillarDepth = pillarDepth ?? 0;
  const threshold =
    level === "pillars"
      ? resolvedPillarDepth
      : (clusterDepth ?? resolvedPillarDepth + 1);

  const collect = (siblings: PlanNodeTreeItem[], depth: number) => {
    for (const item of siblings) {
      if (
        item.node.node_type !== "home" &&
        item.children.length > 0 &&
        depth >= threshold
      ) {
        targets.add(item.node.id);
      }
      collect(item.children, depth + 1);
    }
  };
  collect(items, 0);
  return targets;
}

/**
 * Collapse every expandable branch except Home. Home is the permanent root,
 * so the fully-collapsed view still shows every page directly beneath it.
 */
export function collapseAllTargets(items: PlanNodeTreeItem[]): Set<string> {
  const targets = new Set<string>();
  const walk = (siblings: PlanNodeTreeItem[]) => {
    for (const item of siblings) {
      if (item.node.node_type !== "home" && item.children.length > 0) {
        targets.add(item.node.id);
      }
      walk(item.children);
    }
  };
  walk(items);
  return targets;
}

/** Total descendant count per node id (for collapsed-row count badges). */
export function countDescendants(
  items: PlanNodeTreeItem[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (item: PlanNodeTreeItem): number => {
    let total = 0;
    for (const child of item.children) total += 1 + walk(child);
    counts.set(item.node.id, total);
    return total;
  };
  for (const item of items) walk(item);
  return counts;
}

// ─── Shared visibility projections (tree + site map) ───────────────────────

/** Minimal row shape the visibility helpers need. */
export interface PlanishRow {
  id: string;
  parent_id: string | null;
}

/**
 * Keep every row matching the predicate PLUS its ancestors (so the tree never
 * shatters into orphans when a filter is active). Non-matching ancestors come
 * back in `dimmed` — views render them faded but still actionable.
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
