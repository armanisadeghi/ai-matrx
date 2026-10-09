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
 *   - The width is always clamped to the space the panel has NOW: never more
 *     than `maxShare` of its parent (re-checked whenever the parent resizes),
 *     so a width chosen on a wide monitor never crushes the page in a small
 *     window. The person's chosen width is kept and comes back when there is
 *     room again.
 *   - With `onCollapse`, dragging past the minimum and KEEPING ON (80px past
 *     it) closes the panel — it slides shut while the pointer is still down,
 *     and dragging back out undoes it. The width it had is kept for reopening.
 *   - `overlay` lays the same panel OVER the page (the hover preview of a
 *     collapsed nav) instead of beside it.
 *
 * Widths persist per `panelId` in a cookie; a host that reads it on the server
 * (`readSidePanelWidth`) passes `initialWidth`, so the first paint is right.
 */

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { PANEL_MOTION_CLASS } from "@ai-matrx/design-system";
import { clampSidePanelWidth, writeSidePanelWidth, type SidePanelSizes } from "./side-panel-width";

/** Arrow-key step, and the Shift+arrow step, in px. */
const KEY_STEP_PX = 16;
const KEY_STEP_LARGE_PX = 64;
/** A panel never takes more than this share of the space it sits in. */
const DEFAULT_MAX_SHARE = 0.6;
/** How far past the minimum a drag must go before it closes the panel. */
const COLLAPSE_PAST_PX = 80;
/**
 * THE slide — every docked panel opens and closes on THE panel motion
 * (motion-standard law: `PANEL_MOTION_CLASS`, the shell sidebar's own 600ms
 * even ease-in-out), never a front-loaded snap (Arman, 2026-09-27: 200ms was
 * "far too fast").
 */
export const SIDE_PANEL_SLIDE_CLASS = `transition-[width] ${PANEL_MOTION_CLASS}`;

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
  /** Largest share of the parent the panel may take (default 0.6). */
  maxShare?: number;
  /** No handle: the panel keeps its width. */
  resizable?: boolean;
  /**
   * A CSS custom property set on the PARENT element to the width the panel
   * takes right now (0px when closed) — for page UI pinned to the viewport
   * that must stay clear of it. Written straight to the DOM: no re-render.
   */
  publishWidthAs?: `--${string}`;
  onWidthChange?: (width: number) => void;
  /** Present = dragging well past the minimum closes the panel (the host sets `open` false). */
  onCollapse?: () => void;
  "aria-label": string;
  children: ReactNode;
  /** Classes for the panel body (background, border, padding). */
  className?: string;
  /** Classes for the panel's own box (e.g. `max-lg:hidden` for a desktop-only panel). */
  outerClassName?: string;
  /** Pointer entered / left the panel (its handle included). Not reported while dragging. */
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
  publishWidthAs,
  onWidthChange,
  onCollapse,
  children,
  className,
  outerClassName,
  onPointerEnter,
  onPointerLeave,
  "aria-label": ariaLabel,
}: DockedSidePanelProps) {
  const outerRef = useRef<HTMLElement>(null);
  /** The person's chosen width (kept even when there is no room for it now). */
  const [chosenWidth, setChosenWidth] = useState(initialWidth ?? sizes.defaultPx);
  const [parentWidth, setParentWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [collapsePending, setCollapsePending] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number; latest: number } | null>(null);

  // The space the panel sits in, tracked so the clamp follows the window.
  useEffect(() => {
    const parent = outerRef.current?.parentElement;
    if (!parent) return undefined;
    const observer = new ResizeObserver(() => setParentWidth(parent.clientWidth));
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const maxNow =
    parentWidth > 0
      ? Math.max(sizes.minPx, Math.min(sizes.maxPx, Math.floor(parentWidth * maxShare)))
      : sizes.maxPx;
  const limits: SidePanelSizes = { defaultPx: sizes.defaultPx, minPx: sizes.minPx, maxPx: maxNow };
  const width = clampSidePanelWidth(chosenWidth, limits);
  const occupied = open && !collapsePending ? width : 0;

  useEffect(() => {
    if (!publishWidthAs) return undefined;
    outerRef.current?.parentElement?.style.setProperty(publishWidthAs, `${occupied}px`);
    return undefined;
  }, [publishWidthAs, occupied]);
  useEffect(() => {
    if (!publishWidthAs) return undefined;
    const parent = outerRef.current?.parentElement;
    return () => parent?.style.setProperty(publishWidthAs, "0px");
  }, [publishWidthAs]);

  const commit = (next: number) => {
    setChosenWidth(next);
    writeSidePanelWidth(panelId, next);
    onWidthChange?.(next);
  };

  // Growth direction: a left panel grows to the right, a right panel to the left.
  const grow = edge === "left" ? 1 : -1;

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: width, latest: width };
    setDragging(true);
  };
  // Window-level while dragging: the drag ends cleanly wherever the pointer is
  // released — even if the panel closed or its handle went away mid-drag.
  const onDragMove = useEffectEvent((e: PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const raw = current.startWidth + (e.clientX - current.startX) * grow;
    const pending = onCollapse !== undefined && raw < limits.minPx - COLLAPSE_PAST_PX;
    setCollapsePending(pending);
    if (pending) return;
    current.latest = clampSidePanelWidth(raw, limits);
    setChosenWidth(current.latest);
  });
  const onDragEnd = useEffectEvent(() => {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (!current) return;
    if (collapsePending) {
      // Closed by dragging: reopen at the width it had before this drag.
      setCollapsePending(false);
      setChosenWidth(current.startWidth);
      onCollapse?.();
      return;
    }
    commit(current.latest);
  });
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e: PointerEvent) => onDragMove(e);
    const end = () => onDragEnd();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    // The whole page shows the resize cursor and selects nothing meanwhile.
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = width + step * grow;
    else if (e.key === "ArrowLeft") next = width - step * grow;
    else if (e.key === "Home") next = limits.minPx;
    else if (e.key === "End") next = limits.maxPx;
    if (next === null) return;
    e.preventDefault();
    commit(clampSidePanelWidth(next, limits));
  };

  const outerStyle: CSSProperties = { width: occupied };

  return (
    <aside
      ref={outerRef}
      aria-label={ariaLabel}
      aria-hidden={!open || undefined}
      inert={!open}
      data-side-panel={panelId}
      data-state={open ? "open" : "closed"}
      onPointerEnter={(e) => {
        if (!dragging) onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        if (!dragging) onPointerLeave?.(e);
      }}
      style={outerStyle}
      className={cn(
        "relative flex h-full min-h-0 shrink-0 overflow-hidden",
        edge === "right" ? "justify-end" : "justify-start",
        // The slide. Off while dragging, so the edge follows the pointer exactly —
        // except when a drag past the minimum is closing it.
        (!dragging || collapsePending) && SIDE_PANEL_SLIDE_CLASS,
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
          aria-valuemin={limits.minPx}
          aria-valuemax={limits.maxPx}
          aria-valuenow={width}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={onHandlePointerDown}
          onDoubleClick={() => commit(clampSidePanelWidth(sizes.defaultPx, limits))}
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
