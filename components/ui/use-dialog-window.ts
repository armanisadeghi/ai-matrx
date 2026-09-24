"use client";

/**
 * useDialogWindow — PROTOTYPE of the light non-blocking dialog (register
 * common-docs/projects/ai-reachable-everywhere/REGISTER.md, ARE-006).
 *
 * Arman, 2026-09-23: "What if we had a really simple version of the window
 * panel that gave us the best features of the window panel, but we essentially
 * just made it such that our dialogue now did that."
 *
 * What a dialog gets from this, on desktop:
 *   - it does NOT block the page: no overlay, the Agents menu, the assist dock,
 *     right-click AI, chat and the page itself stay usable (`modal: false`);
 *   - a click outside never closes it (a window closes from its X or Escape,
 *     never from the person reaching for something beside it);
 *   - its header drags it anywhere, clamped so it can never be dragged off
 *     screen; a double-click on the header puts it back in the middle.
 * On a phone it stays the blocking bottom sheet (ARE-007): nothing useful sits
 * behind a sheet on a phone.
 *
 * Proven on Table settings first; the same behaviour then moves INTO the
 * package `Dialog` so every screen gets it without knowing (ARE-006). It is a
 * hook over the existing Dialog, not a WindowPanel: the window system must load
 * in a lazy chunk and is far heavier than a dialog needs to be.
 */

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { useIsMobile } from "@/hooks/use-mobile";

/** Pixels of the card that must stay on screen when dragged to an edge. */
const KEEP_VISIBLE = 80;

export function useDialogWindow() {
  const isMobile = useIsMobile();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const onHeaderPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (isMobile || event.button !== 0) return;
      // A press on a control inside the header (a link, a button) is that
      // control's, never a drag.
      if ((event.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
      drag.current = { startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [isMobile, offset.x, offset.y],
  );

  const onHeaderPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start) return;
    const maxX = window.innerWidth / 2 - KEEP_VISIBLE / 2;
    const maxY = window.innerHeight / 2 - KEEP_VISIBLE / 2;
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    setOffset({
      x: clamp(start.baseX + event.clientX - start.startX, maxX),
      y: clamp(start.baseY + event.clientY - start.startY, maxY),
    });
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }, []);

  const contentStyle: CSSProperties | undefined =
    isMobile || (offset.x === 0 && offset.y === 0)
      ? undefined
      : { translate: `${offset.x}px ${offset.y}px` };

  return {
    /** Spread on `<Dialog>`. */
    rootProps: { modal: isMobile },
    /** Spread on `<DialogContent>`. */
    contentProps: {
      style: contentStyle,
      // A window never closes because the person clicked beside it.
      onInteractOutside: (event: Event) => {
        if (!isMobile) event.preventDefault();
      },
    },
    /** Spread on the header element that drags the card. */
    handleProps: isMobile
      ? {}
      : {
          onPointerDown: onHeaderPointerDown,
          onPointerMove: onHeaderPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onDoubleClick: () => setOffset({ x: 0, y: 0 }),
          className: "cursor-grab select-none active:cursor-grabbing",
          title: "Drag to move · double-click to recenter",
        },
  };
}
