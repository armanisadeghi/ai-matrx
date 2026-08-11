"use client";

/**
 * features/marketing/content-plan/components/PlanTree.tsx
 *
 * The plan tree — every planned URL as an indented, collapsible row, with a
 * full list-management toolbar (PlanTreeToolbar): search (label/route/slug,
 * ancestors kept but dimmed), status/type/keyword/reviewer filters,
 * sibling-level sort, expand/collapse all, and the Pillars/Clusters/All
 * level control (Pillars = the top-level overview). Home is a permanent,
 * non-collapsible root; a full collapse leaves its first-tier pages visible.
 * Drag a row and drop it ONTO another row to reparent (one `parent_id` write;
 * the DB recomputes the whole subtree's routes/labels — the client renders
 * what comes back, it never computes). While dragging, drop on the root strip
 * to make a node top-level.
 * Cycle / cross-site / duplicate-slug violations are DB errors surfaced
 * verbatim by the caller. Pure list logic: ../lib/tree-view.ts.
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../constants";
import {
  collapseAllTargets,
  collapseTargetsForLevel,
  countActiveTreeFilters,
  countDescendants,
  EMPTY_TREE_FILTERS,
  nodeMatchesTreeQuery,
  sortPlanTreeSiblings,
  type TreeFilters,
  type TreeLevel,
  type TreeSortMode,
} from "../lib/tree-view";
import type { PlanNodeRow, PlanNodeTreeItem, PlanNodeType } from "../types";
import { buildPlanTree } from "../types";
import { filterWithAncestors } from "./pillar-map/layouts";
import { PlanTreeToolbar, type TreeStatusOption } from "./PlanTreeToolbar";

interface FlatRow {
  node: PlanNodeRow;
  depth: number;
  hasChildren: boolean;
}

function flatten(
  items: PlanNodeTreeItem[],
  collapsed: ReadonlySet<string>,
  depth = 0,
  out: FlatRow[] = [],
): FlatRow[] {
  for (const item of items) {
    out.push({ node: item.node, depth, hasChildren: item.children.length > 0 });
    if (!collapsed.has(item.node.id)) {
      flatten(item.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

/** While a search/filter is active every ancestor chain stays open. */
const NOTHING_COLLAPSED: ReadonlySet<string> = new Set();

export interface PlanTreeProps {
  nodes: PlanNodeRow[];
  selectedId: string | null;
  statusSlugById: Map<string, string>;
  /** node_id → crawl reconciler match — rows with an entry are LIVE on the
   * real site (Reality overlay; empty/absent = overlay off). */
  liveById?: Map<string, { url: string }>;
  /** node_id → the CMS page realizing it (WF-11 overlay; absent = no pairing
   * or no page yet). */
  cmsPageById?: Map<
    string,
    { route: string | null; isPublished: boolean; liveUrl: string | null }
  >;
  onSelect: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onAddChild: (parentId: string | null) => void;
}

export function PlanTree({
  nodes,
  selectedId,
  statusSlugById,
  liveById,
  cmsPageById,
  onSelect,
  onReparent,
  onAddChild,
}: PlanTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TreeFilters>(EMPTY_TREE_FILTERS);
  const [sortMode, setSortMode] = useState<TreeSortMode>("tree");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Same dimension the workbench/map read — React Query dedupes the fetch.
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });
  const statusOrderById = useMemo(() => {
    const map = new Map<string, number>();
    statusCategories.categories.forEach((category, index) => {
      map.set(category.id, index);
    });
    return map;
  }, [statusCategories.categories]);

  const searchLower = search.trim().toLowerCase();
  const queryActive = searchLower !== "" || countActiveTreeFilters(filters) > 0;

  // Matching nodes keep their ancestors (rendered dimmed) so the tree stays
  // coherent — same shared pure helper the pillar map uses.
  const { rows: visibleNodes, dimmed } = useMemo(() => {
    if (!queryActive) {
      return { rows: nodes, dimmed: new Set<string>() };
    }
    return filterWithAncestors(nodes, (node) =>
      nodeMatchesTreeQuery(node, filters, searchLower),
    );
  }, [nodes, filters, searchLower, queryActive]);

  const tree = useMemo(
    () =>
      sortPlanTreeSiblings(
        buildPlanTree(visibleNodes),
        sortMode,
        statusOrderById,
      ),
    [visibleNodes, sortMode, statusOrderById],
  );
  const descendantCounts = useMemo(() => countDescendants(tree), [tree]);
  const rows = useMemo(
    () => flatten(tree, queryActive ? NOTHING_COLLAPSED : collapsed),
    [tree, collapsed, queryActive],
  );
  const byId = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const statusOptions = useMemo<TreeStatusOption[]>(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const key = node.status_id ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return statusCategories.categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      count: counts.get(category.id) ?? 0,
    }));
  }, [nodes, statusCategories.categories]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      counts.set(node.node_type, (counts.get(node.node_type) ?? 0) + 1);
    }
    return counts;
  }, [nodes]);

  const matchedCount = visibleNodes.length - dimmed.size;

  const toggleCollapse = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Level presets and expand/collapse-all work off the FULL tree so a later
  // filter change never resurrects nodes the user meant to keep collapsed.
  const applyLevel = (level: TreeLevel) => {
    if (level === "all") {
      setCollapsed(new Set());
      return;
    }
    setCollapsed(collapseTargetsForLevel(buildPlanTree(nodes), level));
  };
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () =>
    setCollapsed(collapseAllTargets(buildPlanTree(nodes)));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = String(active.id);
    if (over.id === "plan-tree-root") {
      const dragged = byId.get(draggedId);
      if (dragged && dragged.parent_id !== null) onReparent(draggedId, null);
      return;
    }
    const targetId = String(over.id);
    if (targetId === draggedId) return;
    const dragged = byId.get(draggedId);
    if (!dragged || dragged.parent_id === targetId) return;
    // Client-side guard for the obvious cycle (dropping onto own descendant)
    // so the common case never round-trips; the DB trigger remains the
    // authority and still rejects anything this walk misses.
    let cursor: string | null = targetId;
    while (cursor) {
      if (cursor === draggedId) return;
      cursor = byId.get(cursor)?.parent_id ?? null;
    }
    onReparent(draggedId, targetId);
  };

  const activeNode = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div data-surface-value="plan_tree" className="flex h-full flex-col">
        <PlanTreeToolbar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          statusOptions={statusOptions}
          typeCounts={typeCounts}
          totalCount={nodes.length}
          matchedCount={matchedCount}
          queryActive={queryActive}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onLevel={applyLevel}
          onAddRoot={() => onAddChild(null)}
        />
        {activeId ? <RootDropStrip /> : null}
        <div
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-0.5"
          role="tree"
          aria-label="Content plan pages"
        >
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {nodes.length === 0 ? "No nodes planned yet" : "No pages match"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {nodes.length === 0
                  ? "Add the first pillar or the home node."
                  : "Adjust the search or clear the filters above."}
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <TreeRow
                key={row.node.id}
                row={row}
                selected={row.node.id === selectedId}
                collapsed={!queryActive && collapsed.has(row.node.id)}
                dimmed={dimmed.has(row.node.id)}
                descendantCount={descendantCounts.get(row.node.id) ?? 0}
                statusSlug={statusSlugById.get(row.node.status_id ?? "")}
                liveMatch={liveById?.get(row.node.id) ?? null}
                cmsPage={cmsPageById?.get(row.node.id) ?? null}
                dragging={row.node.id === activeId}
                onSelect={() => onSelect(row.node.id)}
                onToggle={() => {
                  if (row.node.node_type !== "home") {
                    toggleCollapse(row.node.id);
                  }
                }}
                onAddChild={() => onAddChild(row.node.id)}
              />
            ))
          )}
        </div>
      </div>
      <DragOverlay>
        {activeNode ? (
          <div className="rounded border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-md">
            {activeNode.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function RootDropStrip() {
  const { isOver, setNodeRef } = useDroppable({ id: "plan-tree-root" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-7 shrink-0 items-center justify-center border-b border-primary/30 bg-primary/5 px-2 text-[11px] font-medium text-primary transition-colors",
        isOver && "bg-primary/15",
      )}
    >
      Drop here to move to the top level
    </div>
  );
}

function TreeRow({
  row,
  selected,
  collapsed,
  dimmed,
  descendantCount,
  statusSlug,
  liveMatch,
  cmsPage,
  dragging,
  onSelect,
  onToggle,
  onAddChild,
}: {
  row: FlatRow;
  selected: boolean;
  collapsed: boolean;
  dimmed: boolean;
  descendantCount: number;
  statusSlug: string | undefined;
  /** Present when the Reality overlay says this route is live on the site. */
  liveMatch: { url: string } | null;
  /** Present when a CMS page realizes this node (WF-11 overlay). */
  cmsPage: {
    route: string | null;
    isPublished: boolean;
    liveUrl: string | null;
  } | null;
  dragging: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onAddChild: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.node.id });
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: row.node.id });

  // Home and pillars are the plan's first-class structure — they read
  // heavier than clusters/articles at every state.
  const topLevelType =
    row.node.node_type === "home" || row.node.node_type === "pillar";
  const isHome = row.node.node_type === "home";

  return (
    <div
      ref={setDropRef}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={
        row.hasChildren && !isHome ? (collapsed ? false : true) : undefined
      }
      className={cn(
        // Two-line row: full label on line 1, full route on line 2 — page
        // names and routes are the content of this tool, never truncated.
        // Selection is unmistakable: primary wash + 2px left rail + heavier
        // label weight. Hover stays visibly distinct from selected.
        "group relative flex min-h-9 items-start gap-1 border-l-2 py-1 pr-1 transition-colors",
        selected
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:bg-accent/50",
        isOver &&
          !dragging &&
          "bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/40",
        dragging && "opacity-40",
      )}
      style={{ paddingLeft: `${row.depth * 14 + (isHome ? 4 : 2)}px` }}
    >
      {Array.from({ length: row.depth }, (_unused, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-border/45"
          style={{ left: `${index * 14 + 9}px` }}
        />
      ))}
      {!isHome ? (
        <button
          type="button"
          aria-label={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "relative z-[1] mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
            !row.hasChildren && "invisible",
          )}
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
      <div
        ref={setDragRef}
        {...attributes}
        {...listeners}
        className={cn(
          "relative z-[1] flex min-w-0 flex-1 cursor-grab items-start gap-1.5",
          // Non-matching ancestors of a search/filter hit: kept for
          // coherence, visibly secondary, still fully interactive.
          dimmed && "opacity-50",
        )}
        onClick={onSelect}
      >
        <span
          className={cn(
            "mt-[7px] h-2 w-2 shrink-0 rounded-full",
            planStatusColor(statusSlug),
          )}
          title={statusSlug ?? "no status"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-sm leading-snug text-foreground">
              <span
                className={cn(
                  selected || topLevelType ? "font-semibold" : "font-medium",
                )}
              >
                {row.node.label}
              </span>
              {collapsed && descendantCount > 0 ? (
                <span
                  className="ml-1.5 inline-block rounded-full bg-muted px-1.5 align-middle text-[10px] font-medium tabular-nums leading-4 text-muted-foreground"
                  title={`${descendantCount} pages inside`}
                >
                  {descendantCount}
                </span>
              ) : null}
              {liveMatch ? (
                <span
                  className="ml-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle ring-2 ring-emerald-500/25"
                  title={`Live on the site: ${liveMatch.url}`}
                />
              ) : null}
              {cmsPage ? (
                <span
                  className={cn(
                    "ml-1.5 inline-block rounded px-1 align-middle text-[10px] font-medium leading-4",
                    cmsPage.isPublished
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                  )}
                  title={
                    cmsPage.isPublished
                      ? `Published CMS page: ${cmsPage.liveUrl ?? cmsPage.route ?? ""}`
                      : `Draft CMS page: ${cmsPage.route ?? ""}`
                  }
                >
                  {cmsPage.isPublished ? "published" : "page"}
                </span>
              ) : null}
            </span>
            <span className="mt-px shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {NODE_TYPE_LABELS[row.node.node_type as PlanNodeType] ??
                row.node.node_type}
            </span>
          </div>
          {row.node.route ? (
            <span className="block break-all font-mono text-[11px] leading-tight text-muted-foreground">
              {row.node.route}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 shrink-0 p-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Add child node"
        onClick={onAddChild}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
