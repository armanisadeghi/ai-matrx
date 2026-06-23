"use client";

// features/war-room/components/room/threadDrag.tsx
//
// Feature e007e2fc — the shared drag-reorder primitives for War Room threads.
// Built on @dnd-kit/sortable (already a dependency, the canonical reorder lib
// here — see features/scope-system/components/ReorderDialog.tsx). One place so
// the Stage rail and the Grid gallery share identical sensor + sortable wiring.
//
// `ThreadDragHandle` is the minimal shape a tile component needs to render a
// grip that starts a drag without swallowing its own click (stage / focus). A
// tile gets it from <SortableThread> via render-prop and spreads it on its grip.

import type { CSSProperties } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** The handle props a tile spreads on its drag grip. */
export interface ThreadDragHandle {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

/**
 * A drag-and-drop reorder context over a list of thread ids. The caller renders
 * each child via `renderItem(id, dragHandle)`; on drop, `onReorder` receives the
 * full id list in its new order (commit it via useThreadReorder.commitOrder).
 *
 * `strategy`: "vertical" for the Stage rail, "grid" for the Grid gallery.
 */
export function ThreadSortable({
  ids,
  strategy = "vertical",
  onReorder,
  children,
}: {
  ids: string[];
  strategy?: "vertical" | "grid";
  onReorder: (orderedIds: string[]) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    // A small distance threshold so a click-to-stage isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortStrategy: SortingStrategy =
    strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy;

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={sortStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Wraps one sortable thread: owns the node ref + transform, and hands the drag
 * handle to the child via render-prop so the child decides where the grip lives
 * (its body click stays free for stage/focus). `wrapperClassName` lets a grid
 * cell keep its placement styles.
 */
export function SortableThread({
  id,
  className,
  style,
  children,
}: {
  id: string;
  className?: string;
  style?: CSSProperties;
  children: (handle: ThreadDragHandle, isDragging: boolean) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const mergedStyle: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  return (
    <div ref={setNodeRef} style={mergedStyle} className={className}>
      {children({ attributes, listeners }, isDragging)}
    </div>
  );
}
