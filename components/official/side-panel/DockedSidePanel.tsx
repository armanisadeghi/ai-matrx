"use client";

/**
 * DockedSidePanel — THE docked side panel: in the layout beside the page, it
 * slides open and closed (never a jump), the person drags its inner edge to any
 * width between the panel's min and max, and that width is remembered.
 *
 *   - Open / close animate the panel's WIDTH while its content keeps its own
 *     width, so the content slides out of view instead of reflowing.
 *   - A closed panel stays MOUNTED (a chat keeps its conversation, a list its
 *     scroll) and is `inert` — nothing inside it can be focused or read.
 *   - The resize handle is a real separator: drag it, double-click it for the
 *     default width, or focus it and use ← / → (Shift = bigger steps),
 *     Home / End for min / max.
 *   - `overlay` lays the same panel OVER the page (the hover preview of a
 *     collapsed nav) instead of beside it.
 *
 * Widths persist per `panelId` in a cookie; a host that reads it on the server
 * (`readSidePanelWidth`) passes `initialWidth`, so the first paint is right.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clampSidePanelWidth, writeSidePanelWidth, type SidePanelSizes } from "./side-panel-width";

/** Arrow-key step, and the Shift+arrow step, in px. */
const KEY_STEP_PX = 16;
const KEY_STEP_LARGE_PX = 64;
/** A drag never takes more than this share of the space the panel sits in. */
const DEFAULT_MAX_SHARE = 0.6;

export interface DockedSidePanelProps {
  /** Stable id: the remembered width is stored under it. */
  panelId: string;
  /** Which edge of the layout the panel sits on; the handle is on its inner edge. */
  edge: "left" | "right";
  open: boolean;
  sizes: SidePanelSizes;
  /** Server-read remembered width (`readSidePanelWidth`). Absent = the default. */
  initialWidth?: number;
  /** Lay the panel over the page (a hover preview) instead of beside it. */
  overlay?: boolean;
  /** Largest share of the parent a drag may take (default 0.6). */
  maxShare?: number;
  /** No handle: the panel keeps its width. */
  resizable?: boolean;
  onWidthChange?: (width: number) => void;
  "aria-label": string;
  children: ReactNode;
  /** Classes for the panel body (background, border, padding). */
  className?: string;
  /** Classes for the panel's own box (e.g. `max-lg:hidden` for a desktop-only panel). */
  outerClassName?: string;
  onPointerEnter?: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: React.PointerEvent<HTMLElement>) => void;
}

export function DockedSidePanel({
  panelId,
  edge,
  open,
  sizes,
  initialWidth,
  overlay = false,
  maxShare = DEFAULT_MAX_SHARE,
  resizable = true,
  onWidthChange,
  children,
  className,
  outerClassName,
  onPointerEnter,
  onPointerLeave,
  "aria-label": ariaLabel,
}: DockedSidePanelProps) {
  const [storedWidth, setWidthState] = useState(initialWidth ?? sizes.defaultPx);
  // Always inside today's limits, even if the host's limits changed.
  const width = clampSidePanelWidth(storedWidth, sizes);
  const [dragging, setDragging] = useState(false);
  const outerRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const effectiveMax = () => {
    const parent = outerRef.current?.parentElement?.clientWidth ?? 0;
    return parent > 0 ? Math.max(sizes.minPx, Math.min(sizes.maxPx, Math.floor(parent * maxShare))) : sizes.maxPx;
  };
  const clampNow = (next: number) =>
    clampSidePanelWidth(next, { ...sizes, maxPx: effectiveMax() });

  const commit = (next: number) => {
    setWidthState(next);
    writeSidePanelWidth(panelId, next);
    onWidthChange?.(next);
  };

  // Growth direction: a left panel grows to the right, a right panel to the left.
  const grow = edge === "left" ? 1 : -1;

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setWidthState(clampNow(start.startWidth + (e.clientX - start.startX) * grow));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    commit(width);
  };
  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = width + step * grow;
    else if (e.key === "ArrowLeft") next = width - step * grow;
    else if (e.key === "Home") next = sizes.minPx;
    else if (e.key === "End") next = effectiveMax();
    if (next === null) return;
    e.preventDefault();
    commit(clampNow(next));
  };

  // While dragging the whole page shows the resize cursor and selects nothing.
  useEffect(() => {
    if (!dragging) return undefined;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const outerStyle: CSSProperties = { width: open ? width : 0 };

  return (
    <aside
      ref={outerRef}
      aria-label={ariaLabel}
      aria-hidden={!open || undefined}
      inert={!open}
      data-side-panel={panelId}
      data-state={open ? "open" : "closed"}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={outerStyle}
      className={cn(
        "relative flex h-full min-h-0 shrink-0 overflow-hidden",
        edge === "right" ? "justify-end" : "justify-start",
        // The slide. Off while dragging, so the edge follows the pointer exactly.
        !dragging && "transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        overlay && cn("absolute inset-y-0 z-40 shadow-2xl", edge === "right" ? "right-0" : "left-0"),
        outerClassName,
      )}
    >
      <div style={{ width }} className={cn("flex h-full min-h-0 shrink-0 flex-col", className)}>
        {children}
      </div>
      {resizable && open ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${ariaLabel.toLowerCase()}`}
          aria-valuemin={sizes.minPx}
          aria-valuemax={sizes.maxPx}
          aria-valuenow={width}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => commit(clampNow(sizes.defaultPx))}
          onKeyDown={onHandleKeyDown}
          className={cn(
            "group/handle absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none",
            edge === "left" ? "right-0" : "left-0",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 w-px transition-colors",
              edge === "left" ? "right-0" : "left-0",
              dragging
                ? "bg-primary"
                : "bg-transparent group-hover/handle:bg-primary/50 group-focus-visible/handle:bg-primary",
            )}
          />
        </div>
      ) : null}
    </aside>
  );
}
