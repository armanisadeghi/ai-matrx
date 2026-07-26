"use client";

/**
 * The pillar map — the same plan tree as a spatial graph (React Flow).
 * Pillars orbit the site root, clusters orbit their pillar, articles orbit
 * their cluster. EVERY visual element is actionable (vision constraint —
 * no pretty-but-useless graphs):
 *   · click a node  → opens it in the node panel (drawer on the right);
 *   · drag a node ONTO another → real reparent (one parent_id write, DB
 *     recomputes the subtree);
 *   · box-select several → bulk status change (real writes);
 *   · color = live plan_status category, size = priority.
 * Layout is pure and deterministic from the tree; positions are never
 * persisted (the tree is the truth, the map is a projection).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- this file IS the map Impl; it loads only through the next/dynamic({ssr:false}) wrapper in ContentPlanWorkbench.tsx
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
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

import { planStatusColor, PRIORITY_SIZES } from "../constants";
import type { PlanNodeRow, PlanNodeTreeItem } from "../types";
import { buildPlanTree } from "../types";

interface MapNodeData extends Record<string, unknown> {
  label: string;
  route: string | null;
  nodeType: string;
  statusSlug: string | undefined;
  priority: number | null;
}

type MapNode = Node<MapNodeData>;

/** Deterministic radial layout: root(s) centered, children fan out. */
function layoutTree(items: PlanNodeTreeItem[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const RING = [0, 420, 780, 1050, 1250];

  const countLeaves = (item: PlanNodeTreeItem): number =>
    item.children.length === 0
      ? 1
      : item.children.reduce((sum, child) => sum + countLeaves(child), 0);

  const place = (
    item: PlanNodeTreeItem,
    depth: number,
    angleFrom: number,
    angleTo: number,
  ) => {
    const angle = (angleFrom + angleTo) / 2;
    const radius = RING[Math.min(depth, RING.length - 1)];
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

  const totalLeaves = items.reduce((sum, item) => sum + countLeaves(item), 0) || 1;
  let cursor = -Math.PI / 2;
  for (const item of items) {
    const share = (countLeaves(item) / totalLeaves) * Math.PI * 2;
    // A single root sits at the exact center; multiple roots share ring 1.
    if (items.length === 1) {
      positions.set(item.node.id, { x: 0, y: 0 });
      const total = countLeaves(item);
      let childCursor = -Math.PI / 2;
      for (const child of item.children) {
        const childShare = (countLeaves(child) / total) * Math.PI * 2;
        place(child, 1, childCursor, childCursor + childShare);
        childCursor += childShare;
      }
    } else {
      place(item, 1, cursor, cursor + share);
    }
    cursor += share;
  }
  return positions;
}

function MapNodeView({ data, selected }: { data: MapNodeData; selected?: boolean }) {
  const size =
    data.priority != null ? (PRIORITY_SIZES[data.priority] ?? 34) : 34;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5",
        selected && "outline outline-2 outline-primary rounded-md p-0.5",
      )}
      title={data.route ?? data.label}
    >
      <div
        className={cn(
          "rounded-full border-2 border-background shadow",
          planStatusColor(data.statusSlug),
          data.nodeType === "pillar" && "ring-2 ring-foreground/30",
        )}
        style={{ width: size, height: size }}
      />
      <span className="max-w-32 truncate text-[10px] font-medium text-foreground">
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { plan: MapNodeView };

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatusId, setBulkStatusId] = useState<string>("");
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

  const visible = useMemo(
    () =>
      nodes.filter((node) => {
        if (
          statusFilter !== "all" &&
          statusSlugById.get(node.status_id ?? "") !== statusFilter
        ) {
          return false;
        }
        if (pillarFilter !== "all" && node.pillar_label !== pillarFilter) {
          return false;
        }
        return true;
      }),
    [nodes, statusFilter, pillarFilter, statusSlugById],
  );

  const layout = useMemo(() => layoutTree(buildPlanTree(visible)), [visible]);

  const layoutNodes = useMemo<MapNode[]>(
    () =>
      visible.map((node) => ({
        id: node.id,
        type: "plan",
        position: layout.get(node.id) ?? { x: 0, y: 0 },
        data: {
          label: node.label,
          route: node.route,
          nodeType: node.node_type,
          statusSlug: statusSlugById.get(node.status_id ?? ""),
          priority: node.priority,
        },
      })),
    [visible, layout, statusSlugById],
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
  const handleNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));
    },
    [],
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const ids = new Set(visible.map((node) => node.id));
    return visible
      .filter((node) => node.parent_id && ids.has(node.parent_id))
      .map((node) => ({
        id: `${node.parent_id}-${node.id}`,
        source: node.parent_id as string,
        target: node.id,
        type: "straight",
      }));
  }, [visible]);

  const byId = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onSelect(node.id),
    [onSelect],
  );

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
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-40 text-xs">
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
        <Select value={pillarFilter} onValueChange={setPillarFilter}>
          <SelectTrigger className="h-7 w-44 text-xs">
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
            Drag onto a node to reparent · click to edit · shift-drag to multi-select
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
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
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
