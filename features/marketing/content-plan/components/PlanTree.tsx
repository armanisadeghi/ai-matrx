"use client";

/**
 * features/marketing/content-plan/components/PlanTree.tsx
 *
 * The plan tree — every planned URL as an indented, collapsible row.
 * Drag a row and drop it ONTO another row to reparent (one `parent_id`
 * write; the DB recomputes the whole subtree's routes/labels — the client
 * renders what comes back, it never computes). Drop on the "root" strip to
 * make a node top-level. Cycle / cross-site / duplicate-slug violations are
 * DB errors surfaced verbatim by the caller.
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
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../constants";
import type { PlanNodeRow, PlanNodeTreeItem, PlanNodeType } from "../types";
import { buildPlanTree } from "../types";

interface FlatRow {
  node: PlanNodeRow;
  depth: number;
  hasChildren: boolean;
}

function flatten(
  items: PlanNodeTreeItem[],
  collapsed: Set<string>,
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

export interface PlanTreeProps {
  nodes: PlanNodeRow[];
  selectedId: string | null;
  statusSlugById: Map<string, string>;
  onSelect: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onAddChild: (parentId: string | null) => void;
}

export function PlanTree({
  nodes,
  selectedId,
  statusSlugById,
  onSelect,
  onReparent,
  onAddChild,
}: PlanTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const tree = useMemo(() => buildPlanTree(nodes), [nodes]);
  const rows = useMemo(() => flatten(tree, collapsed), [tree, collapsed]);
  const byId = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const toggleCollapse = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      <div className="flex h-full flex-col">
        <RootDropStrip onAddRoot={() => onAddChild(null)} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                No nodes planned yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the first pillar or the home node.
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <TreeRow
                key={row.node.id}
                row={row}
                selected={row.node.id === selectedId}
                collapsed={collapsed.has(row.node.id)}
                statusSlug={statusSlugById.get(row.node.status_id ?? "")}
                dragging={row.node.id === activeId}
                onSelect={() => onSelect(row.node.id)}
                onToggle={() => toggleCollapse(row.node.id)}
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

function RootDropStrip({ onAddRoot }: { onAddRoot: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: "plan-tree-root" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-between border-b border-border px-2 py-1",
        isOver && "bg-accent",
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Site root — drop here for top level
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs"
        onClick={onAddRoot}
      >
        <Plus className="mr-1 h-3 w-3" /> Root node
      </Button>
    </div>
  );
}

function TreeRow({
  row,
  selected,
  collapsed,
  statusSlug,
  dragging,
  onSelect,
  onToggle,
  onAddChild,
}: {
  row: FlatRow;
  selected: boolean;
  collapsed: boolean;
  statusSlug: string | undefined;
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

  return (
    <div
      ref={setDropRef}
      className={cn(
        // Two-line row: full label on line 1, full route on line 2 — page
        // names and routes are the content of this tool, never truncated.
        // Selection is unmistakable: primary wash + 2px left rail + heavier
        // label weight. Hover stays visibly distinct from selected.
        "group flex items-start gap-1 border-l-2 py-1 pr-1 transition-colors",
        selected
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:bg-accent/50",
        isOver &&
          !dragging &&
          "bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/40",
        dragging && "opacity-40",
      )}
      style={{ paddingLeft: `${row.depth * 16 + 2}px` }}
    >
      <button
        type="button"
        aria-label={collapsed ? "Expand" : "Collapse"}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground",
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
      <div
        ref={setDragRef}
        {...attributes}
        {...listeners}
        className="flex min-w-0 flex-1 cursor-grab items-start gap-1.5"
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
            <span
              className={cn(
                "min-w-0 break-words text-sm leading-snug text-foreground",
                selected ? "font-semibold" : "font-medium",
              )}
            >
              {row.node.label}
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
