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
 * THE BLOCK HOLDS ITS FINAL SIZE BEFORE ITS DATA LANDS (round 26 CLS; round 27 D2; round 29: nothing is
 * hidden). A table draws its frame, then its rows, then re-measures them (its body went 212 → 259 → 230
 * → 266 → 229 px in half a second), and a chart adds its "Only showing" chip once its rows are counted.
 * Each step moved the blocks under it a few seconds after load. So the block takes, from its first frame,
 * the size it was last painted at as its exact size (min AND max, overflow clipped) until its content has
 * been still for SETTLE_QUIET_MS — growing and re-measuring happen inside the block, never to the page:
 *  - kept on this device (localStorage, at this width), else
 *  - `paintedSize` in the block's own props: the size the page's last save measured (`paintedSizes`,
 *    written by every save), so a first visit on any device holds it too — when its width is close.
 * SETTLE_MAX_MS ends the hold whatever the content does. The page body is never hidden while it waits.
 */
const SETTLE_QUIET_MS = 450;
const SAMPLE_MS = 150;
const SETTLE_MAX_MS = 4000;

/**
 * A block's size as a save measured it (CSS px): its own width `w`, height `h`, and the window's width `vw`
 * then. A block keeps one per window width it was painted at (a person at 1280 and one at 1699 each find
 * theirs), newest first, at most PAINTED_KEEP.
 */
export interface PaintedSize {
  w: number;
  h: number;
  vw: number;
  /** Measured with the built-in table's "+ New page" row (round 30, 92ab128fa7). Absent on older saves. */
  nr?: 1;
}
/** A stored size counts at a width this close to the one it was painted at. */
export const PAINTED_WIDTH_SLACK = 24;
const PAINTED_KEEP = 4;
/** The built-in table's "+ New page" row (`.spaces-db-newrow`, 34px), which older saved sizes do not hold. */
export const NEW_PAGE_ROW_PX = 34;

/**
 * A block's stored sizes. `withNewRow`: the block draws the built-in table's "+ New page" row, so a size
 * saved before that row existed (no `nr`) is short by the row and is read back with it added — no save
 * is needed and nothing shifts when the row lands (round 31).
 */
export function readPaintedSizes(raw: unknown, withNewRow = false): PaintedSize[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.flatMap((v: { w?: unknown; h?: unknown; vw?: unknown; nr?: unknown }) =>
    v && typeof v.w === "number" && typeof v.h === "number" && v.h > 0
      ? [{ w: v.w, h: withNewRow && v.nr !== 1 ? v.h + NEW_PAGE_ROW_PX : v.h, vw: typeof v.vw === "number" ? v.vw : 0, ...(withNewRow || v.nr === 1 ? { nr: 1 as const } : {}) }]
      : [],
  );
}
/** Whether a database block's props draw the built-in table's "+ New page" row (an entity source). */
export function drawsNewPageRow(props: Record<string, unknown> | undefined): boolean {
  const source = props?.["source"] as { kind?: unknown } | undefined;
  return source?.kind === "entity";
}
/** A database block's stored sizes, read for what it draws now. */
export function paintedSizesOf(props: Record<string, unknown> | undefined): PaintedSize[] {
  return readPaintedSizes(props?.["paintedSize"], drawsNewPageRow(props));
}
/** The stored size for a block drawn `width` wide (else, before layout, in a window `vw` wide). */
export function pickPainted(list: PaintedSize[], at: { width?: number; vw?: number }): PaintedSize | null {
  const near = (a: number, b: number | undefined) => b !== undefined && Math.abs(a - b) <= PAINTED_WIDTH_SLACK;
  return list.find((p) => near(p.w, at.width)) ?? (at.width === undefined ? (list.find((p) => near(p.vw, at.vw)) ?? null) : null);
}

function useHeldHeight(blockId: string | undefined, ref: React.RefObject<HTMLDivElement | null>, painted: PaintedSize[], firstFrame = true): number | undefined {
  // The first frame already holds the stored size (before any effect): the block is never drawn short.
  // A block drawn on the server (the static first paint, round 34) holds it by CSS instead — the server
  // has no window, and the hydrating pass must draw what the server drew.
  const [hold, setHold] = useState<number | undefined>(() => (!firstFrame || typeof window === "undefined" ? undefined : pickPainted(painted, { vw: window.innerWidth })?.h));
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
      const width = el.getBoundingClientRect().width;
      key = heightKey(blockId, width);
      let held = 0;
      try {
        held = Number(window.localStorage.getItem(key)) || 0;
      } catch {
        held = 0;
      }
      if (!(held > 0)) held = pickPainted(painted, { width })?.h ?? 0;
      setHold(held > 0 ? held : undefined);
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
    // The stored size is read once, at mount (a later save's new size is for the next visit).
  }, [blockId, ref]);
  return hold;
}

/** The block's element. It stops nothing: every press and key reaches the table and React above it. */
export function DatabaseHost({ children, blockId, layout, painted, serverDrawn }: { children: ReactNode; blockId?: string; layout?: string; painted?: PaintedSize[]; serverDrawn?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const hold = useHeldHeight(blockId, ref, painted ?? [], !serverDrawn);
  return (
    <div
      ref={ref}
      className={DATABASE_HOST_CLASS}
      contentEditable={false}
      data-layout={layout}
      data-block-id={blockId}
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

/**
 * Every database block's size as painted now, written into the blocks a save sends (`paintedSize`), so
 * the next visit on any device holds it from the first frame. A block not on screen, or still loading,
 * keeps the size it had.
 */
export function withPaintedSizes<B extends { type: string; id: string; props?: Record<string, unknown>; children?: B[] }>(blocks: B[]): B[] {
  if (typeof document === "undefined") return blocks;
  const walk = (list: B[]): B[] =>
    list.map((b) => {
      const kids = b.children?.length ? walk(b.children) : b.children;
      let props = b.props;
      if (b.type === "database") {
        const el = document.querySelector<HTMLElement>(`.${DATABASE_HOST_CLASS}[data-block-id="${CSS.escape(b.id)}"]`);
        // Still holding (style.height set) or loading: not its own size yet.
        const r = el && !el.style.height && !el.querySelector(".spaces-db-loading") ? el.getBoundingClientRect() : null;
        if (r && r.height > 0) {
          const now: PaintedSize = { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, nr: 1 };
          const kept = paintedSizesOf(props).filter((p) => Math.abs(p.w - now.w) > PAINTED_WIDTH_SLACK);
          props = { ...props, paintedSize: [now, ...kept].slice(0, PAINTED_KEEP) };
        }
      }
      return props === b.props && kids === b.children ? b : { ...b, props, children: kids };
    });
  return walk(blocks);
}
