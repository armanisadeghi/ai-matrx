"use client";

/**
 * SurfaceLayoutPreview — the builder's drag-to-place miniature of the Run
 * Surface grid. Every readout renders as a proportional box on the 24-column
 * grid; dragging a box and dropping it converts the pixel delta to grid units
 * and hands the caller the requested position — the caller runs it through
 * `applyPlacement` (moved item wins, others shove down, compaction), so the
 * preview never re-implements layout rules.
 *
 * Position only: sizes stay on the row steppers (dnd-kit models dragging,
 * not resizing — a resize affordance would be a second layout authority).
 */

import { useRef } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import {
  GRID_COLUMNS,
  describeSource,
  type GridPos,
  type Readout,
  type RunSurfaceConfig,
} from "../surface/config";

/** Miniature row unit — the preview is a map, not the surface. */
const PREVIEW_ROW_PX = 10;

function PreviewBox({ readout }: { readout: Readout }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: readout.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        position: "absolute",
        left: `${(readout.pos.x / GRID_COLUMNS) * 100}%`,
        top: readout.pos.y * PREVIEW_ROW_PX,
        width: `${(readout.pos.w / GRID_COLUMNS) * 100}%`,
        height: readout.pos.h * PREVIEW_ROW_PX,
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 10 : undefined,
      }}
      className={
        isDragging
          ? "flex cursor-grabbing items-start overflow-hidden rounded border border-primary bg-primary/10 px-1 py-0.5"
          : "flex cursor-grab items-start overflow-hidden rounded border border-border bg-card px-1 py-0.5 hover:border-primary/50"
      }
    >
      <span className="truncate text-[10px] leading-tight text-muted-foreground">
        {readout.title ?? describeSource(readout.source)}
      </span>
    </div>
  );
}

export function SurfaceLayoutPreview({
  config,
  onPlace,
}: {
  config: RunSurfaceConfig;
  /** Requested position for a dragged readout — run it through applyPlacement. */
  onPlace: (id: string, pos: GridPos) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // A small activation distance keeps plain clicks from starting drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const bottom = config.readouts.reduce(
    (max, r) => Math.max(max, r.pos.y + r.pos.h),
    6,
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const width = containerRef.current?.getBoundingClientRect().width;
    if (!width) return;
    const readout = config.readouts.find((r) => r.id === event.active.id);
    if (!readout) return;
    const colPx = width / GRID_COLUMNS;
    const dx = Math.round(event.delta.x / colPx);
    const dy = Math.round(event.delta.y / PREVIEW_ROW_PX);
    if (dx === 0 && dy === 0) return;
    // applyPlacement (in the caller) clamps to the grid — no clamping here.
    onPlace(readout.id, {
      ...readout.pos,
      x: readout.pos.x + dx,
      y: readout.pos.y + dy,
    });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        ref={containerRef}
        className="relative w-full rounded-md border border-border bg-muted/30"
        style={{ height: (bottom + 1) * PREVIEW_ROW_PX }}
      >
        {config.readouts.map((r) => (
          <PreviewBox key={r.id} readout={r} />
        ))}
      </div>
    </DndContext>
  );
}
