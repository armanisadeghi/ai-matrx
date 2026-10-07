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
 * THE BLOCK HOLDS ITS FINAL SIZE BEFORE ITS DATA LANDS (round 26, CLS; round 27, D2; round 28). A table
 * draws its frame, then its rows, then re-measures them (its body went 212 → 259 → 230 → 266 → 229 px in
 * half a second), and a chart adds its "Only showing" chip once its rows are counted. Each step moved the
 * blocks under it (a heading, a checklist, a callout) 0.03–0.14 a few seconds after load.
 *  - Kept: a view takes the height it last settled at, at this width on this device, as its exact size
 *    (min AND max, overflow clipped) until its content has been still for SETTLE_QUIET_MS — growing,
 *    shrinking and re-measuring happen inside the block, never to the page.
 *  - First visit (nothing kept) and in view: the block marks itself `data-settling` until the same
 *    stillness; while any block settles the page body is held hidden (spaces.css) and then shown whole —
 *    content appearing is not a shift, content moving is.
 * SETTLE_MAX_MS ends either hold whatever the content does. The key follows the block's width: the column
 * layout around a block can be drawn after its first layout, and a new width re-reads what is kept.
 */
const SETTLE_QUIET_MS = 450;
const SAMPLE_MS = 150;
const SETTLE_MAX_MS = 4000;
function useHeldHeight(blockId: string | undefined, ref: React.RefObject<HTMLDivElement | null>): { hold: number | undefined; settling: boolean } {
  const [hold, setHold] = useState<number | undefined>(undefined);
  const [settling, setSettling] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !blockId) return;
    let key = "";
    let done = false;
    let quiet: number | undefined;
    const measure = (): number | null => {
      if (el.querySelector(".spaces-db-loading")) return null;
      const child = el.firstElementChild as HTMLElement | null;
      if (!child) return null;
      const cs = getComputedStyle(child);
      return Math.round(child.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom));
    };
    const keep = (h: number) => {
      try {
        window.localStorage.setItem(key, String(h));
      } catch {
        // Storage blocked: nothing kept.
      }
    };
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      const h = measure();
      if (h !== null) keep(h);
      setHold(undefined);
      setSettling(false);
    };
    // Stillness is sampled, not observed: the element the content lives in is replaced as it loads
    // (loading → frame), and a held block's own box never changes size.
    let last: number | null = null;
    let still = 0;
    const arm = () => {
      if (done) return;
      window.clearTimeout(quiet);
      last = null;
      still = 0;
      const sample = () => {
        if (done) return;
        const h = measure();
        still = h !== null && h === last ? still + SAMPLE_MS : 0;
        last = h;
        if (still >= SETTLE_QUIET_MS) finish();
        else quiet = window.setTimeout(sample, SAMPLE_MS);
      };
      quiet = window.setTimeout(sample, SAMPLE_MS);
    };
    const begin = () => {
      key = heightKey(blockId, el.getBoundingClientRect().width);
      let held = 0;
      try {
        held = Number(window.localStorage.getItem(key)) || 0;
      } catch {
        held = 0;
      }
      setHold(held > 0 ? held : undefined);
      setSettling(!(held > 0) && el.getBoundingClientRect().top < window.innerHeight);
      arm();
    };
    begin();
    const cap = window.setTimeout(finish, SETTLE_MAX_MS);
    const ro = new ResizeObserver(() => {
      if (done) {
        // Settled: the view changed later (rows added, a filter): keep its new size for the next visit.
        const h = measure();
        if (h !== null) keep(h);
        return;
      }
      if (heightKey(blockId, el.getBoundingClientRect().width) !== key) begin();
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      done = true;
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      ro.disconnect();
    };
  }, [blockId, ref]);
  return { hold, settling };
}

/** The block's element. It stops nothing: every press and key reaches the table and React above it. */
export function DatabaseHost({ children, blockId, layout }: { children: ReactNode; blockId?: string; layout?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { hold, settling } = useHeldHeight(blockId, ref);
  return (
    <div
      ref={ref}
      className={DATABASE_HOST_CLASS}
      contentEditable={false}
      data-layout={layout}
      data-settling={settling ? "" : undefined}
      style={hold ? { height: hold, overflow: "clip" } : undefined}
    >
      {children}
    </div>
  );
}

/** The layout of a stored database block's open view (its frame's geometry is known before any data). */
export function activeLayout(p: Record<string, unknown>): string | undefined {
  const views = Array.isArray(p.views) ? (p.views as Array<{ id?: string; layout?: string }>) : [];
  return (views.find((v) => v.id === p.activeViewId) ?? views[0])?.layout;
}
