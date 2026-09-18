"use client";

/**
 * components/official/topic-tree/useTopicTreeDnd.ts — drag-to-reparent for
 * {@link TopicTree}, built on the contract `content-plan/components/PlanTree.tsx`
 * already proved: DROP ON A ROW IS THE WHOLE GESTURE. One drop = one
 * `onMove(id, newParentId)`. There is no drop-between-rows target, because
 * re-ordering siblings and re-parenting are different writes and a 3px seam
 * between them is how a user re-parents a branch by accident.
 *
 * A CYCLE IS REFUSED BEFORE THE CALL, not after. `onMove` is the host's write;
 * handing it a move that would hang a topic under its own descendant asks the
 * server to reject something we could see was impossible from the rows in hand.
 * The walk is cheap (parent pointers only) and the server stays the authority
 * for everything this cannot see.
 */

import { useState } from "react";

import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import type { TopicTreeRow } from "./types";

/** The droppable id of the strip that moves a row to the top level. */
export const TOPIC_TREE_ROOT_DROP_ID = "topic-tree-root";

export interface TopicTreeDndArgs {
  rows: readonly TopicTreeRow[];
  onMove?: (id: string, newParentId: string | null) => void;
}

export function useTopicTreeDnd({ rows, onMove }: TopicTreeDndArgs) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // 6px before a drag starts: a click on a row must never be swallowed as a
  // one-pixel drag, which is the classic "the tree stopped selecting" bug.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const parentOf = new Map<string, string | null>();
  for (const row of rows) parentOf.set(row.id, row.parentId);

  function onDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    if (!onMove) return;
    const { active, over } = event;
    if (!over) return;
    const draggedId = String(active.id);

    if (over.id === TOPIC_TREE_ROOT_DROP_ID) {
      // Already at the root: the write would be a no-op, so it is not made.
      if (parentOf.get(draggedId) === null) return;
      onMove(draggedId, null);
      return;
    }

    const targetId = String(over.id);
    if (targetId === draggedId) return;
    if (parentOf.get(draggedId) === targetId) return;

    // Walk the target's ancestors: meeting the dragged row means the drop is
    // onto its own descendant.
    let cursor: string | null = targetId;
    while (cursor) {
      if (cursor === draggedId) return;
      cursor = parentOf.get(cursor) ?? null;
    }
    onMove(draggedId, targetId);
  }

  return {
    enabled: Boolean(onMove),
    sensors,
    activeId,
    activeRow: activeId ? (rows.find((row) => row.id === activeId) ?? null) : null,
    onDragStart,
    onDragEnd,
    onDragCancel: () => setActiveId(null),
  };
}
