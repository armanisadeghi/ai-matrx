"use client";

/**
 * useDockDrag — grab the assists dock and put it somewhere else.
 *
 * Pointer Events (not mouse events) so a trackpad, a pen and a mouse all work
 * through one path, listeners bound once on the window so a fast drag that
 * outruns the element never drops the dock mid-move.
 *
 * Two behaviours the dock depends on:
 *  - **A drag is never a click.** Below `DRAG_THRESHOLD_PX` the gesture stays a
 *    click and the popover opens as before; past it the trailing click is
 *    swallowed, so nudging the dock cannot fire the thing you were moving out
 *    of the way.
 *  - **Touch is deliberately excluded.** A drag gesture on a phone fights the
 *    page scroll, and the mobile dock is already clear of the content band.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  clampDockOffset,
  defaultDockOffset,
  isDrag,
  offsetFromDrag,
  type DockOffset,
  type Viewport,
} from "../dock-position";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: DockOffset;
}

export interface DockDragApi {
  /** Where to render right now — the live drag position, or the stored one. */
  offset: DockOffset;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** True while a gesture has passed the threshold — swallow the click. */
  suppressClickRef: RefObject<boolean>;
}

const SSR_VIEWPORT: Viewport = { width: 1280, height: 800 };

/**
 * The live viewport, re-read on resize: a spot that was reachable on a wide
 * monitor can be off-screen on a laptop, and an unreachable dock is the same
 * defect as one that cannot be moved.
 */
function useViewport(): Viewport {
  const [size, setSize] = useState<Viewport>(SSR_VIEWPORT);
  useEffect(() => {
    const read = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return size;
}

export function useDockDrag(
  stored: DockOffset | null,
  onCommit: (offset: DockOffset) => void,
  enabled: boolean,
): DockDragApi {
  const view = useViewport();
  const [live, setLive] = useState<DockOffset | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  // The pointer listeners below bind once and must still see the CURRENT
  // commit callback and viewport. Refs are written in an effect, never during
  // render — a render-phase ref write is not safe under concurrent rendering.
  const commitRef = useRef(onCommit);
  const viewRef = useRef(view);
  useEffect(() => {
    commitRef.current = onCommit;
    viewRef.current = view;
  });

  const offset =
    live ?? clampDockOffset(stored ?? defaultDockOffset(view), view);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (isDrag(dx, dy)) suppressClickRef.current = true;
      setLive(offsetFromDrag(state.startOffset, dx, dy, viewRef.current));
    };
    const end = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      drag.current = null;
      setLive(null);
      if (isDrag(dx, dy)) {
        commitRef.current(
          offsetFromDrag(state.startOffset, dx, dy, viewRef.current),
        );
        // The click the browser fires next is the tail of this drag, never an
        // intent to open. One frame is enough to let it pass.
        requestAnimationFrame(() => {
          suppressClickRef.current = false;
        });
      } else {
        suppressClickRef.current = false;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType === "touch" || event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
    };
  };

  return { offset, dragging: live !== null, onPointerDown, suppressClickRef };
}
