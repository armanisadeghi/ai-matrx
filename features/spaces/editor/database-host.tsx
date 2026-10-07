"use client";

// features/spaces/editor/database-host.tsx — the element a database block's table lives in, and the
// rule that its presses and keys are the table's, never the page editor's.
//
// A DATABASE BLOCK IS ITS OWN APP INSIDE THE PAGE. ProseMirror listens natively on the editor element,
// so a click on a row became a block selection and the table's keys became the page's. The block used to
// answer that by stopping mousedown, keydown, paste, copy and cut natively on this element — which also
// kept them from React, whose listener sits above the editor: the grid never saw a press, so one click
// never selected a cell, and Enter, a second click and typing did nothing; only a double-click worked
// (lane CELL-EDITORS, 2026-10-06). Now the editor is told to leave those events alone
// (`handleDOMEvents` answering "handled" skips ProseMirror's own handling without stopping the event),
// and they travel on to the table.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** The database block's own element: everything inside it is the table's. */
export const DATABASE_HOST_CLASS = "spaces-db-host";

/** Whether an event started inside a database block (a table living in the page). */
export function insideDatabaseBlock(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(`.${DATABASE_HOST_CLASS}`) !== null;
}

/** The events a table answers itself; ProseMirror's own handling of them is skipped inside the block. */
export const OWNED_BY_THE_TABLE = ["mousedown", "keydown", "keypress", "beforeinput", "paste", "copy", "cut"] as const;

/** ProseMirror `handleDOMEvents`: "handled" (skip the editor's own handling) for an event inside a database block. */
export const DATABASE_EVENT_CLAIMS: Record<(typeof OWNED_BY_THE_TABLE)[number], (view: unknown, event: Event) => boolean> = Object.fromEntries(
  OWNED_BY_THE_TABLE.map((kind) => [kind, (_view: unknown, event: Event) => insideDatabaseBlock(event)]),
) as Record<(typeof OWNED_BY_THE_TABLE)[number], (view: unknown, event: Event) => boolean>;

const heightKey = (blockId: string, width: number) => `spaces:blockh:${blockId}:${Math.round(width / 40)}`;

/**
 * THE BLOCK HOLDS ITS FINAL SIZE BEFORE ITS DATA LANDS (round 26, CLS). A chart view's frame has a fixed
 * height, so its loading state is drawn at that height (`data-layout`, spaces.css). Any other view takes
 * the height it last had at this width on this device until its content is in, then lets go.
 */
function useReservedHeight(blockId: string | undefined, ref: React.RefObject<HTMLDivElement | null>): number | undefined {
  const [reserve, setReserve] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !blockId) return;
    const key = heightKey(blockId, el.getBoundingClientRect().width);
    let landed = false;
    try {
      const kept = Number(window.localStorage.getItem(key));
      if (kept > 0 && el.querySelector(".spaces-db-loading")) setReserve(kept);
    } catch {
      // Storage blocked: the block grows as its content lands.
    }
    const ro = new ResizeObserver(() => {
      if (el.querySelector(".spaces-db-loading")) return;
      const child = el.firstElementChild as HTMLElement | null;
      if (!child) return;
      const cs = getComputedStyle(child);
      const h = Math.round(child.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom));
      try {
        window.localStorage.setItem(key, String(h));
      } catch {
        // nothing kept
      }
      if (!landed) {
        landed = true;
        setReserve(undefined);
      }
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [blockId, ref]);
  return reserve;
}

/** The block's element. It stops nothing: every press and key reaches the table and React above it. */
export function DatabaseHost({ children, blockId, layout }: { children: ReactNode; blockId?: string; layout?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reserve = useReservedHeight(layout === "chart" ? undefined : blockId, ref);
  return (
    <div ref={ref} className={DATABASE_HOST_CLASS} contentEditable={false} data-layout={layout} style={reserve ? { minHeight: reserve } : undefined}>
      {children}
    </div>
  );
}

/** The layout of a stored database block's open view (its frame's geometry is known before any data). */
export function activeLayout(p: Record<string, unknown>): string | undefined {
  const views = Array.isArray(p.views) ? (p.views as Array<{ id?: string; layout?: string }>) : [];
  return (views.find((v) => v.id === p.activeViewId) ?? views[0])?.layout;
}
