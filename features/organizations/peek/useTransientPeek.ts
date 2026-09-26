"use client";

/**
 * useTransientPeek — a PEEK is a quick look, not a window.
 *
 * Since `@ai-matrx/design-system` made every desktop `Dialog` a non-blocking
 * WINDOW (no overlay; an outside click never closes it; Escape closes it only
 * while focus is inside it), every peek built on `Dialog` inherited window
 * behaviour: it stayed open when the person clicked back into the page and
 * ignored Escape unless they had clicked into it first — a quick look that had
 * to be closed with its X (Arman, 2026-09-26).
 *
 * The contract for every peek, applied here once:
 *   - a click outside closes it (`dismissOnOutsideClick` on `DialogContent`);
 *   - Escape closes it wherever focus is — the topmost open peek only, so a
 *     peek opened from inside a peek closes first;
 *   - on a phone it stays the package's bottom sheet, which already dismisses.
 *
 * Spread `PEEK_CONTENT_PROPS` onto the peek's `DialogContent` and call this
 * hook with the peek's open state and close handler. Used by `PeekDialog`
 * (every data-driven peek), `AgentSneakPeekModal` (agents) and the mandate
 * peeks.
 */

import { useEffect, useRef } from "react";

export const PEEK_CONTENT_PROPS = { dismissOnOutsideClick: true } as const;

/** Open peeks, oldest first — Escape closes the last one. */
const openPeeks: symbol[] = [];

export function useTransientPeek(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const me = Symbol("peek");
    openPeeks.push(me);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (openPeeks[openPeeks.length - 1] !== me) return;
      // A menu or popover opened inside the peek closes first.
      const active = document.activeElement;
      if (active instanceof Element && active.closest("[data-radix-popper-content-wrapper]")) return;
      event.preventDefault();
      closeRef.current();
    };
    // WINDOW + CAPTURE: runs before Radix's own document-level Escape
    // listener, whose window mode `preventDefault`s the event when focus is
    // outside the dialog — a bubble listener would only ever see it cancelled.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      const index = openPeeks.indexOf(me);
      if (index >= 0) openPeeks.splice(index, 1);
    };
  }, [open]);
}
