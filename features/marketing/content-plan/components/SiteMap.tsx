"use client";

/**
 * The site map — the plan drawn the way a WEBSITE is shaped (Arman's ruling,
 * 2026-08-20, replacing the React Flow dot graph): the home page at the top,
 * its pages branching below it, every page a real rectangular card whose
 * TITLE IS READABLE (wraps, centered — never truncated) with its route under
 * it, and visible connector lines showing exactly how pages branch. Plain
 * DOM + CSS: native two-axis scroll, text at text size.
 *
 *   · click a card            → selects it (edges to its parent and children
 *                               light up, the full URL un-truncates) and
 *                               opens it in the node panel;
 *   · drag a card onto another → real reparent (same dnd-kit pattern and
 *                               cycle pre-check as the tree; DB authority);
 *   · zoom (toolbar or ctrl+scroll) → semantic: routes/dots hide as you zoom
 *                               out, and far out deep branches auto-collapse
 *                               into counts unless clicked open;
 *   · chevron on a card       → collapse/expand its branch (+N badge);
 *   · search + status/keyword → filter (ancestors of matches stay, dimmed;
 *                               collapse is bypassed so matches show).
 *
 * Bulk status edits stay in the TREE view. Visibility math is shared with
 * the tree (lib/tree-view.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { cn } from "@/lib/utils";

import { planStatusColor } from "../constants";
import type { PlanNodeRow, PlanNodeTreeItem } from "../types";
import { buildPlanTree } from "../types";
import { planNodeKeyFields, planNodeSummary } from "../format";
import { collapseVisible, filterWithAncestors } from "../lib/tree-view";

interface SiteMapProps {
  nodes: PlanNodeRow[];
  statusSlugById: Map<string, string>;
  /** Reality overlay: node_id → crawl match (present = live on the site). */
  liveById?: Map<string, { url: string }>;
  onSelect: (id: string) => void;
  onReparent: (id: string, parentId: string) => void;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.25;
const ZOOM_STEP = 0.1;
/** Below this, routes and indicator dots hide (semantic zoom). */
const ZOOM_DETAIL = 0.75;
/** Below this, branches deeper than the clusters auto-collapse. */
const ZOOM_FAR = 0.55;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

/**
 * One page card. Title wraps (2 lines) and is never middle-truncated; the
 * SELECTED card un-truncates its full URL. Draggable onto another card =
 * reparent; the drop target glows while hovered.
 */
function PageCard({
  item,
  statusSlug,
  isLive,
  dimmed,
  hiddenCount,
  collapsed,
  selected,
  showDetail,
  onSelect,
  onToggle,
}: {
  item: PlanNodeTreeItem;
  statusSlug: string | undefined;
  isLive: boolean;
  dimmed: boolean;
  hiddenCount: number;
  collapsed: boolean;
  selected: boolean;
  showDetail: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const node = item.node;
  const isTopLevel = node.node_type === "home" || node.node_type === "pillar";
  const hasBranch = item.children.length > 0 || hiddenCount > 0;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: node.id });
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: node.id });

  return (
    <div
      ref={(element) => {
        setDragRef(element);
        setDropRef(element);
      }}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
      className={cn(
        "group/card flex cursor-pointer items-stretch overflow-hidden rounded-md border border-border bg-card shadow-sm transition-colors hover:border-primary/60",
        selected ? "w-72 ring-2 ring-primary" : "w-60",
        node.node_type === "home" &&
          !selected &&
          "ring-2 ring-primary/50 ring-offset-1 ring-offset-background",
        dimmed && "opacity-40",
        isDragging && "opacity-30",
        isOver && !isDragging && "border-primary ring-2 ring-primary/60",
      )}
    >
      <span
        className={cn("w-1 shrink-0", planStatusColor(statusSlug))}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2.5 py-1.5">
        <span
          className={cn(
            "line-clamp-2 w-full text-center text-xs leading-snug text-foreground",
            isTopLevel ? "font-semibold" : "font-medium",
          )}
        >
          {node.label}
        </span>
        {node.route && (showDetail || selected) ? (
          <span
            className={cn(
              "w-full text-center font-mono text-[10px] text-muted-foreground",
              // The selected card shows its WHOLE url — that is the one place
              // a route may wrap (Arman: routes were "almost always cut off").
              selected ? "break-all" : "truncate",
            )}
          >
            {node.route}
          </span>
        ) : null}
        {showDetail || hasBranch ? (
          <span className="flex items-center gap-1.5">
            {showDetail && isLive ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                aria-label="Live on the site"
              />
            ) : null}
            {showDetail &&
            node.primary_keyword_id == null &&
            node.node_type !== "home" ? (
              <span
                className="h-1.5 w-1.5 rounded-full border border-amber-500"
                aria-label="No target keyword yet"
              />
            ) : null}
            {hasBranch ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.id);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={
                  collapsed ? "Expand this branch" : "Collapse this branch"
                }
              >
                {collapsed ? (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    {hiddenCount}
                  </>
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A card plus its children as a connected vertical stack (recursive). When a
 * card is SELECTED its edges light up: the rail and ticks to its children,
 * and the tick that joins it to its parent.
 */
function Branch({
  item,
  selectedId,
  render,
}: {
  item: PlanNodeTreeItem;
  selectedId: string | null;
  render: (item: PlanNodeTreeItem) => React.ReactNode;
}) {
  const isSelected = item.node.id === selectedId;
  return (
    <div className="flex flex-col">
      {render(item)}
      {item.children.length > 0 ? (
        <div
          className={cn(
            "relative ml-5 mt-1.5 flex flex-col gap-1.5 border-l pl-3",
            isSelected ? "border-primary" : "border-border",
          )}
        >
          {item.children.map((child) => (
            <div key={child.node.id} className="relative">
              <span
                className={cn(
                  "absolute -left-3 top-4 h-px w-3",
                  isSelected || child.node.id === selectedId
                    ? "bg-primary"
                    : "bg-border",
                )}
                aria-hidden
              />
              <Branch item={child} selectedId={selectedId} render={render} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The ┬ connector above each top-level column. The vertical stub drops onto
 * the CARD's center (cards are w-60 → center at 7.5rem, at the column's
 * left edge); the horizontal segments join the continuous spine under the
 * home card. Lights up when home (whole spine) or this column (stub) is
 * selected.
 */
function ColumnConnector({
  first,
  last,
  spineLit,
  stubLit,
}: {
  first: boolean;
  last: boolean;
  spineLit: boolean;
  stubLit: boolean;
}) {
  const spine = spineLit ? "bg-primary" : "bg-border";
  return (
    <div className="relative h-5" aria-hidden>
      <span
        className={cn(
          "absolute left-[7.5rem] top-0 h-full w-px",
          spineLit || stubLit ? "bg-primary" : "bg-border",
        )}
      />
      {!first ? (
        <span className={cn("absolute left-0 top-0 h-px w-[7.5rem]", spine)} />
      ) : null}
      {!last ? (
        <span
          className={cn("absolute left-[7.5rem] right-0 top-0 h-px", spine)}
        />
      ) : null}
    </div>
  );
}

export function SiteMap({
  nodes,
  statusSlugById,
  liveById,
  onSelect,
  onReparent,
}: SiteMapProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [userCollapsed, setUserCollapsed] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [userOpened, setUserOpened] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragId, setDragId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Ctrl/⌘ + wheel zooms (native listener — React's wheel is passive, and
  // zoom must preventDefault so the browser doesn't page-zoom).
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) =>
        clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const showDetail = zoom >= ZOOM_DETAIL;
  const farOut = zoom < ZOOM_FAR;

  const byId = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const expandableIds = useMemo(() => {
    const parents = new Set<string>();
    for (const node of nodes) {
      if (node.parent_id) parents.add(node.parent_id);
    }
    return parents;
  }, [nodes]);

  /** Visual depth per node (root = 0), for the far-zoom auto-collapse. */
  const depthById = useMemo(() => {
    const depths = new Map<string, number>();
    const resolve = (id: string): number => {
      const known = depths.get(id);
      if (known !== undefined) return known;
      const parentId = byId.get(id)?.parent_id;
      const depth =
        parentId && byId.has(parentId) ? resolve(parentId) + 1 : 0;
      depths.set(id, depth);
      return depth;
    };
    for (const node of nodes) resolve(node.id);
    return depths;
  }, [nodes, byId]);

  // Far out, deep branches auto-collapse into counts unless the user clicked
  // them open (semantic zoom, Arman 2026-08-20). Depth ≥ 2 = below the
  // pillar tier on a home-rooted plan.
  const collapsed = useMemo(() => {
    const set = new Set(userCollapsed);
    if (farOut) {
      for (const id of expandableIds) {
        if ((depthById.get(id) ?? 0) >= 2) set.add(id);
      }
    }
    for (const id of userOpened) set.delete(id);
    return set as ReadonlySet<string>;
  }, [userCollapsed, userOpened, farOut, expandableIds, depthById]);

  // Filter (keeping ancestors, dimmed) then collapse — both pure and shared
  // with the tree view.
  const searchLower = search.trim().toLowerCase();
  const { rows: filteredRows, dimmed } = useMemo(
    () =>
      filterWithAncestors(nodes, (node) => {
        if (
          statusFilter !== "all" &&
          statusSlugById.get(node.status_id ?? "") !== statusFilter
        ) {
          return false;
        }
        if (keywordFilter === "has" && !node.primary_keyword_id) return false;
        if (keywordFilter === "missing" && node.primary_keyword_id) return false;
        if (searchLower) {
          const haystack =
            `${node.label}\n${node.route ?? ""}\n${node.slug ?? ""}`.toLowerCase();
          if (!haystack.includes(searchLower)) return false;
        }
        return true;
      }),
    [nodes, statusFilter, keywordFilter, searchLower, statusSlugById],
  );

  const filtersActive =
    searchLower.length > 0 || statusFilter !== "all" || keywordFilter !== "all";

  // While a search/filter is active the collapse set is bypassed so every
  // match is visible (same rule as the tree view).
  const { rows: visible, hiddenCounts } = useMemo(
    () => collapseVisible(filteredRows, filtersActive ? new Set() : collapsed),
    [filteredRows, collapsed, filtersActive],
  );

  const roots = useMemo(() => buildPlanTree(visible), [visible]);

  const toggleBranch = (id: string) => {
    if (collapsed.has(id)) {
      setUserCollapsed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setUserOpened((current) => new Set(current).add(id));
    } else {
      setUserOpened((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setUserCollapsed((current) => new Set(current).add(id));
    }
  };

  const collapseBranches = () => {
    // Collapse every top-level branch (home stays open so the first tier is
    // always on screen — the site overview).
    const targets = nodes
      .filter((node) => {
        if (!expandableIds.has(node.id)) return false;
        const depth = depthById.get(node.id) ?? 0;
        return depth === 1 || (depth === 0 && node.node_type !== "home");
      })
      .map((node) => node.id);
    setUserOpened(new Set());
    setUserCollapsed(new Set(targets));
  };

  const expandAll = () => {
    setUserCollapsed(new Set());
    // Far out, "expand all" means "open everything the zoom auto-collapsed".
    setUserOpened(farOut ? new Set(expandableIds) : new Set());
  };

  const anyCollapsed = collapsed.size > 0;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect(id);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = String(active.id);
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

  // The home page crowns the map; its children are the connected columns.
  // Stray extra roots (pages planned without a parent) become columns too —
  // the site never hides a page just because its parent link is missing.
  const homeRoot =
    roots.find((root) => root.node.node_type === "home") ??
    (roots.length === 1 ? roots[0] : null);
  const columns = homeRoot
    ? [...homeRoot.children, ...roots.filter((root) => root !== homeRoot)]
    : roots;

  const homeSelected = homeRoot != null && homeRoot.node.id === selectedId;
  const dragNode = dragId ? byId.get(dragId) : null;

  const renderCard = (item: PlanNodeTreeItem) => (
    <PageCard
      item={item}
      statusSlug={statusSlugById.get(item.node.status_id ?? "")}
      isLive={liveById?.has(item.node.id) ?? false}
      dimmed={dimmed.has(item.node.id)}
      hiddenCount={hiddenCounts.get(item.node.id) ?? 0}
      collapsed={collapsed.has(item.node.id)}
      selected={item.node.id === selectedId}
      showDetail={showDetail}
      onSelect={handleSelect}
      onToggle={toggleBranch}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search pages…"
          className="h-7 w-52 text-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusCategories.categories.map((category) => (
              <SelectItem key={category.id} value={category.slug ?? category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={keywordFilter} onValueChange={setKeywordFilter}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Keyword: any</SelectItem>
            <SelectItem value="has">Has keyword</SelectItem>
            <SelectItem value="missing">Missing keyword</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={anyCollapsed ? expandAll : collapseBranches}
        >
          {anyCollapsed ? "Expand all" : "Collapse branches"}
        </Button>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            className="w-10 rounded text-center text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Reset zoom"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CopyButtons
          size="icon"
          label="Site map"
          human={() =>
            [
              `Site map — ${visible.length} of ${nodes.length} pages shown`,
              ...visible.map(planNodeSummary),
            ].join("\n")
          }
          json={() => visible.map(planNodeKeyFields)}
          agentVariant={{
            id: "this-view",
            label: "This view",
            hint: "The pages on screen, with the active search and filters",
            position: "first",
          }}
          agent={() => ({
            kind: "plan_site_map_view",
            location: webLocation("Content Plan — site map"),
            description:
              "The site map as rendered: the pages currently shown, and the search/filters that produced them.",
            data: {
              pages: visible.map((node) => ({
                ...planNodeKeyFields(node),
                dimmed: dimmed.has(node.id),
                collapsed_descendants: hiddenCounts.get(node.id) ?? 0,
                selected: node.id === selectedId,
              })),
            },
            attributes: {
              rows: visible.length,
              pages_planned: nodes.length,
              zoom,
            },
            context: {
              search,
              status_filter: statusFilter,
              keyword_filter: keywordFilter,
              collapsed_branches: collapsed.size,
            },
          })}
          aiVariants={[
            {
              id: "everything",
              label: "Everything",
              hint: "Every planned page, ignoring the map's filters",
              build: () => ({
                kind: "plan_site_map",
                location: webLocation("Content Plan — site map"),
                description:
                  "Every page in this plan (the whole tree behind the site map, ignoring its filters).",
                data: { pages: nodes.map(planNodeKeyFields) },
                attributes: {
                  detail: "everything",
                  pages_planned: nodes.length,
                },
              }),
            },
          ]}
        />
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {visible.length === nodes.length
              ? `${nodes.length} pages`
              : `${visible.length} of ${nodes.length} pages`}
          </span>
          <span className="hidden lg:inline">
            drag a card onto another to move it
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full border border-amber-500" />{" "}
            no keyword
          </span>
        </span>
      </div>
      {statusCategories.categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1 text-[10px] text-muted-foreground">
          {statusCategories.categories.map((category) => (
            <span key={category.id} className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  planStatusColor(category.slug ?? category.id),
                )}
              />
              {category.name}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {nodes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No pages planned yet — use Setup or Generate to plan this site.
          </p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-6">
            <p className="text-sm text-muted-foreground">
              No pages match the current search and filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setKeywordFilter("all");
              }}
            >
              Clear search &amp; filters
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* CSS zoom (not transform) so layout size shrinks with the
              content and the scrollbars stay honest. */}
            <div className="min-w-max p-6" style={{ zoom }}>
              {homeRoot ? (
                // Home sits above the FIRST column (not centered over the
                // whole row — a 300-page row is wider than any screen, and a
                // centered home would live off-screen). Its stub drops onto
                // the spine at the first column's connector.
                <div className="flex flex-col items-start">
                  {renderCard(homeRoot)}
                  {columns.length > 0 ? (
                    <>
                      <div
                        className={cn(
                          "ml-[7.5rem] h-5 w-px",
                          homeSelected ? "bg-primary" : "bg-border",
                        )}
                        aria-hidden
                      />
                      <div className="flex items-start">
                        {columns.map((column, index) => (
                          <div
                            key={column.node.id}
                            className={cn(
                              "flex flex-col",
                              index < columns.length - 1 && "pr-5",
                            )}
                          >
                            <ColumnConnector
                              first={index === 0}
                              last={index === columns.length - 1}
                              spineLit={homeSelected}
                              stubLit={column.node.id === selectedId}
                            />
                            <Branch
                              item={column}
                              selectedId={selectedId}
                              render={renderCard}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  {columns.map((column) => (
                    <Branch
                      key={column.node.id}
                      item={column}
                      selectedId={selectedId}
                      render={renderCard}
                    />
                  ))}
                </div>
              )}
              {filtersActive ? (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Faded pages don&apos;t match the search or filters — they stay
                  so the site never loses its shape.
                </p>
              ) : null}
            </div>
            <DragOverlay dropAnimation={null}>
              {dragNode ? (
                <div className="w-60 rounded-md border border-primary bg-card px-2.5 py-1.5 text-center text-xs font-medium shadow-lg">
                  {dragNode.label}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
