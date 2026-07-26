"use client";

/**
 * The pillar map — the same plan tree as a spatial graph (React Flow).
 * EVERY visual element is actionable (vision constraint — no pretty-but-
 * useless graphs):
 *   · click a node        → opens it in the node panel (right drawer);
 *   · drag a node ONTO another → real reparent (one parent_id write, DB
 *     recomputes the subtree);
 *   · box-select several  → bulk status change (real writes);
 *   · double-click a pillar/cluster → collapse/expand its subtree into a
 *     count-badged super-node (scale technique for 400+ node plans).
 * Three user-switchable auto-layouts (persisted in localStorage): radial
 * orbit, tidy tree, pillar columns — all pure functions in
 * pillar-map/layouts.ts. Dimension encoding lives on the node
 * (pillar-map/PlanMapNode.tsx) and is explained by the toggleable legend
 * (pillar-map/MapLegend.tsx): color = status, shape = node_type,
 * size = priority, dashed outline = needs_reviewer, corner dot = primary
 * keyword. Filters cover status / type / pillar / keyword coverage /
 * reviewer / technical depth; filtered-out ancestors stay visible but dimmed
 * so the tree never shatters. Semantic zoom hides article/cluster labels at
 * far zoom bands. Positions are never persisted (the tree is the truth, the
 * map is a projection).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- this file IS the map Impl; it loads only through the next/dynamic({ssr:false}) wrapper in ContentPlanWorkbench.tsx
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
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

import {
  NODE_TYPE_LABELS,
  PILLAR_MAP_LAYOUTS,
  PILLAR_MAP_STORAGE_KEY,
  type PillarMapLayoutId,
} from "../constants";
import type { PlanNodeRow } from "../types";
import { buildPlanTree, PLAN_NODE_TYPES, TECHNICAL_DEPTHS } from "../types";
import {
  collapseVisible,
  filterWithAncestors,
  groupedLayout,
  middleTruncate,
  radialLayout,
  tidyTreeLayout,
  type XY,
} from "./pillar-map/layouts";
import { MapLegend } from "./pillar-map/MapLegend";
import { PlanMapNodeView, type PlanMapNodeData } from "./pillar-map/PlanMapNode";

type MapNode = Node<PlanMapNodeData>;
type ZoomBand = "far" | "mid" | "near";

const LAYOUT_FN: Record<
  PillarMapLayoutId,
  (items: ReturnType<typeof buildPlanTree>) => Map<string, XY>
> = {
  radial: radialLayout,
  tree: tidyTreeLayout,
  grouped: groupedLayout,
};

const EDGE_STYLE = {
  stroke: "hsl(var(--muted-foreground) / 0.5)",
  strokeWidth: 1,
} as const;

const nodeTypes = { plan: PlanMapNodeView };

interface PersistedMapPrefs {
  layout?: PillarMapLayoutId;
  legend?: boolean;
}

function readPrefs(): PersistedMapPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PILLAR_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const candidate = parsed as PersistedMapPrefs;
    return {
      layout: PILLAR_MAP_LAYOUTS.some((entry) => entry.id === candidate.layout)
        ? candidate.layout
        : undefined,
      legend: typeof candidate.legend === "boolean" ? candidate.legend : undefined,
    };
  } catch {
    return {};
  }
}

/** Reports the quantized zoom band upward — parent re-renders only on band change. */
function ZoomBandWatcher({ onBand }: { onBand: (band: ZoomBand) => void }) {
  const band = useStore((state): ZoomBand => {
    const zoom = state.transform[2];
    return zoom < 0.35 ? "far" : zoom < 0.8 ? "mid" : "near";
  });
  useEffect(() => {
    onBand(band);
  }, [band, onBand]);
  return null;
}

export function PillarMap({
  nodes,
  statusSlugById,
  onSelect,
  onReparent,
  onBulkStatus,
}: {
  nodes: PlanNodeRow[];
  statusSlugById: Map<string, string>;
  onSelect: (id: string) => void;
  onReparent: (id: string, parentId: string) => void;
  onBulkStatus: (ids: string[], statusId: string) => void;
}) {
  const [prefs] = useState(readPrefs);
  const [layoutId, setLayoutId] = useState<PillarMapLayoutId>(
    prefs.layout ?? "radial",
  );
  const [showLegend, setShowLegend] = useState(prefs.legend ?? true);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PILLAR_MAP_STORAGE_KEY,
        JSON.stringify({ layout: layoutId, legend: showLegend }),
      );
    } catch {
      // Storage unavailable (private mode) — prefs just don't persist.
    }
  }, [layoutId, showLegend]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [reviewerFilter, setReviewerFilter] = useState<string>("all");
  const [depthFilter, setDepthFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatusId, setBulkStatusId] = useState<string>("");
  const [zoomBand, setZoomBand] = useState<ZoomBand>("mid");
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });

  const pillarLabels = useMemo(
    () =>
      Array.from(
        new Set(nodes.map((node) => node.pillar_label).filter(Boolean)),
      ) as string[],
    [nodes],
  );

  const legendStatuses = useMemo(
    () =>
      statusCategories.categories.map((category) => ({
        slug: category.slug ?? category.id,
        label: category.name,
      })),
    [statusCategories.categories],
  );

  // Filter (keeping ancestors, dimmed) then collapse — both pure.
  const { rows: filteredRows, dimmed } = useMemo(
    () =>
      filterWithAncestors(nodes, (node) => {
        if (
          statusFilter !== "all" &&
          statusSlugById.get(node.status_id ?? "") !== statusFilter
        ) {
          return false;
        }
        if (typeFilter !== "all" && node.node_type !== typeFilter) return false;
        if (pillarFilter !== "all" && node.pillar_label !== pillarFilter) {
          return false;
        }
        if (keywordFilter === "has" && !node.primary_keyword_id) return false;
        if (keywordFilter === "missing" && node.primary_keyword_id) return false;
        if (reviewerFilter === "only" && !node.needs_reviewer) return false;
        if (depthFilter !== "all" && node.technical_depth !== depthFilter) {
          return false;
        }
        return true;
      }),
    [
      nodes,
      statusFilter,
      typeFilter,
      pillarFilter,
      keywordFilter,
      reviewerFilter,
      depthFilter,
      statusSlugById,
    ],
  );

  const { rows: visible, hiddenCounts } = useMemo(
    () => collapseVisible(filteredRows, collapsed),
    [filteredRows, collapsed],
  );

  const layout = useMemo(
    () => LAYOUT_FN[layoutId](buildPlanTree(visible)),
    [visible, layoutId],
  );

  const layoutNodes = useMemo<MapNode[]>(
    () =>
      visible.map((node) => ({
        id: node.id,
        type: "plan",
        position: layout.get(node.id) ?? { x: 0, y: 0 },
        data: {
          label: node.label,
          canvasLabel: middleTruncate(node.label),
          route: node.route,
          nodeType: node.node_type,
          statusSlug: statusSlugById.get(node.status_id ?? ""),
          priority: node.priority,
          needsReviewer: node.needs_reviewer === true,
          hasKeyword: node.primary_keyword_id != null,
          collapsedCount: hiddenCounts.get(node.id) ?? 0,
          dimmed: dimmed.has(node.id),
        },
      })),
    [visible, layout, statusSlugById, hiddenCounts, dimmed],
  );

  // Controlled React Flow: drag movement + selection flags only persist if
  // node changes are APPLIED — a controlled flow without onNodesChange is a
  // frozen flow. Data/layout changes re-seed the state; live positions for
  // drop detection are read from THIS state, never the pure layout output.
  const [flowNodes, setFlowNodes] = useState<MapNode[]>(layoutNodes);
  const flowNodesRef = useRef(flowNodes);
  useEffect(() => {
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);
  const [prevLayoutNodes, setPrevLayoutNodes] = useState(layoutNodes);
  if (prevLayoutNodes !== layoutNodes) {
    setPrevLayoutNodes(layoutNodes);
    setFlowNodes(layoutNodes);
  }
  const handleNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    setFlowNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const flowEdges = useMemo<Edge[]>(() => {
    const ids = new Set(visible.map((node) => node.id));
    return visible
      .filter((node) => node.parent_id && ids.has(node.parent_id))
      .map((node) => ({
        id: `${node.parent_id}-${node.id}`,
        source: node.parent_id as string,
        target: node.id,
        type: layoutId === "tree" ? "default" : "straight",
        style: EDGE_STYLE,
      }));
  }, [visible, layoutId]);

  const byId = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const hasChildren = useMemo(() => {
    const parents = new Set<string>();
    for (const node of nodes) if (node.parent_id) parents.add(node.parent_id);
    return parents;
  }, [nodes]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onSelect(node.id),
    [onSelect],
  );

  const handleNodeDoubleClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const row = byId.get(node.id);
      if (!row) return;
      if (row.node_type !== "pillar" && row.node_type !== "cluster") return;
      if (!hasChildren.has(row.id)) return;
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    },
    [byId, hasChildren],
  );

  const collapseAllPillars = useCallback(() => {
    setCollapsed(
      new Set(
        nodes
          .filter(
            (node) => node.node_type === "pillar" && hasChildren.has(node.id),
          )
          .map((node) => node.id),
      ),
    );
  }, [nodes, hasChildren]);

  const handleNodeDragStop = useCallback(
    (_event: unknown, dragged: Node) => {
      // Find the nearest OTHER node center within the drop radius, using
      // the LIVE controlled positions (nodes may have been dragged aside).
      let nearest: { id: string; distance: number } | null = null;
      for (const other of flowNodesRef.current) {
        if (other.id === dragged.id) continue;
        const distance = Math.hypot(
          other.position.x - dragged.position.x,
          other.position.y - dragged.position.y,
        );
        const id = other.id;
        if (distance < 70 && (!nearest || distance < nearest.distance)) {
          nearest = { id, distance };
        }
      }
      if (!nearest) return;
      const row = byId.get(dragged.id);
      if (!row || row.parent_id === nearest.id) return;
      // Cycle pre-check (DB still authoritative).
      let cursor: string | null = nearest.id;
      while (cursor) {
        if (cursor === dragged.id) return;
        cursor = byId.get(cursor)?.parent_id ?? null;
      }
      onReparent(dragged.id, nearest.id);
    },
    [byId, onReparent],
  );

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      setSelectedIds(params.nodes.map((node) => node.id));
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
        <Select
          value={layoutId}
          onValueChange={(value) => setLayoutId(value as PillarMapLayoutId)}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PILLAR_MAP_LAYOUTS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {PLAN_NODE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {NODE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pillarFilter} onValueChange={setPillarFilter}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pillars</SelectItem>
            {pillarLabels.map((label) => (
              <SelectItem key={label} value={label}>
                {label}
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
        <Select value={reviewerFilter} onValueChange={setReviewerFilter}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Reviewer: any</SelectItem>
            <SelectItem value="only">Needs reviewer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={depthFilter} onValueChange={setDepthFilter}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any depth</SelectItem>
            {TECHNICAL_DEPTHS.map((depth) => (
              <SelectItem key={depth} value={depth}>
                {depth[0].toUpperCase() + depth.slice(1)} depth
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={collapsed.size > 0 ? () => setCollapsed(new Set()) : collapseAllPillars}
        >
          {collapsed.size > 0 ? "Expand all" : "Collapse pillars"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 text-xs", showLegend && "bg-accent")}
          onClick={() => setShowLegend((current) => !current)}
        >
          Legend
        </Button>
        {selectedIds.length > 1 ? (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} selected —
            </span>
            <Select value={bulkStatusId} onValueChange={setBulkStatusId}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {statusCategories.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!bulkStatusId}
              onClick={() => onBulkStatus(selectedIds, bulkStatusId)}
            >
              Apply
            </Button>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Drag onto a node to reparent · click to edit · double-click a pillar
            to collapse · shift-drag to multi-select
          </span>
        )}
      </div>
      <div className="group min-h-0 flex-1" data-zoom-band={zoomBand}>
        <ReactFlow
          key={layoutId}
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeDragStop={handleNodeDragStop}
          onSelectionChange={handleSelectionChange}
          onlyRenderVisibleElements
          fitView
          minZoom={0.05}
          selectionOnDrag
          panOnDrag={[1, 2]}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <ZoomBandWatcher onBand={setZoomBand} />
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!bg-card"
            maskColor="hsl(var(--muted) / 0.6)"
          />
          {showLegend ? (
            <Panel position="top-left" className="!m-2">
              <MapLegend statuses={legendStatuses} />
            </Panel>
          ) : null}
        </ReactFlow>
      </div>
    </div>
  );
}
