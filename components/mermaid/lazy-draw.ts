// components/mermaid/lazy-draw.ts
//
// 🚨 A DIAGRAM IS DRAWN WHEN SOMEONE CAN SEE IT — AND EVERY ONE IS DRAWN BEFORE A
// PRINT. Mermaid measures text with getBBox for every label, so drawing ~50
// diagrams on paste held a 5 MB document's main thread for ~9 s (the markdown
// tester crash, 2026-09-26). A diagram now draws when its placeholder comes
// within DRAW_MARGIN of the viewport.
//
// THEN THE REST, IN IDLE TIME. Once nothing near the viewport is drawing, the
// diagrams further away draw IDLE_BATCH at a time in requestIdleCallback, so by
// the time anyone prints from the browser menu every diagram exists (chair
// ruling 2026-09-26: a browser print never shows placeholders).
//
// THE RENDER-ALL PATH. Anything that captures or prints the live page calls
// `renderAllDiagrams()` first (it resolves when every mounted diagram has
// drawn, or says how many did not); `printLivePage()` does that and then opens
// the browser's print. `beforeprint` flips the same switch as a backstop.

"use client";

import { nearestScrollRoot } from "@/lib/layout/scroll-root";
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** How far outside the viewport a diagram starts drawing. */
export const DRAW_MARGIN = "1200px 0px";

/**
 * Open render-all passes (a print, a page capture). Render-all lasts only as
 * long as a pass is open: a flag that stayed on after one Cmd+P disabled every
 * lazy-render protection for the rest of the session — a 5 MB paste then
 * mounted all 8,269 blocks, stalled 31.5 s and grew the heap to 2.6 GB
 * (verifier round 2, 2026-09-26).
 */
let renderAllPasses = 0;
let renderAll = false;
const listeners = new Set<() => void>();
/** Diagrams mounted but not yet drawn. */
const pending = new Set<symbol>();
const drawnWaiters = new Set<() => void>();
/** Pending diagrams not yet asked to draw, and how to ask each one. */
const sleepers = new Map<symbol, () => void>();
/** Asked to draw (near the viewport or by the idle queue) but not drawn yet. */
const drawing = new Set<symbol>();

/**
 * Diagrams the idle queue wakes per idle period. One: a diagram is a single
 * long task (mermaid measures every label), so two at once doubled the stall.
 */
export const IDLE_BATCH = 1;
let idleScheduled = false;

function scheduleIdleDraws() {
  if (idleScheduled || typeof window === "undefined") return;
  idleScheduled = true;
  const run = () => {
    idleScheduled = false;
    // Never pile on: the next batch waits for the diagrams already drawing.
    if (drawing.size > 0) {
      if (sleepers.size > 0) setTimeout(scheduleIdleDraws, 150);
      return;
    }
    let woken = 0;
    for (const [token, wake] of sleepers) {
      if (woken >= IDLE_BATCH) break;
      sleepers.delete(token);
      drawing.add(token);
      wake();
      woken++;
    }
    if (sleepers.size > 0) setTimeout(scheduleIdleDraws, 150);
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  // TRUE idle only — no timeout. With `{ timeout: 2000 }` a busy page (a
  // 1 MB document still mounting, a person typing) fired the queue anyway every
  // two seconds, so "idle" diagrams drew back to back under load: a chat
  // answer's 1 MB Preview stalled 230 s in total (verifier round 1, row 3).
  if (ric) ric(run);
  else setTimeout(run, 200);
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setRenderAll() {
  const next = renderAllPasses > 0;
  if (next === renderAll) return;
  renderAll = next;
  emit();
}

/**
 * Open a render-all pass; call the returned function when the print or
 * capture is over (idempotent). Diagrams drawn during the pass stay drawn.
 */
export function beginRenderAllPass(): () => void {
  renderAllPasses++;
  setRenderAll();
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    renderAllPasses = Math.max(0, renderAllPasses - 1);
    setRenderAll();
  };
}

if (typeof window !== "undefined") {
  // The browser's own print (menu, Cmd+P): one pass from beforeprint to afterprint.
  let browserPrint: (() => void) | null = null;
  window.addEventListener("beforeprint", () => {
    browserPrint ??= beginRenderAllPass();
  });
  window.addEventListener("afterprint", () => {
    browserPrint?.();
    browserPrint = null;
  });
}

/** Test seam: whether a render-all pass is open. */
export function isRenderAllActive(): boolean {
  return renderAll;
}

/**
 * Draw every diagram now. Resolves when all mounted diagrams have drawn, or
 * after `timeoutMs` with the number still pending (never silently).
 */
export async function renderAllDiagrams(
  timeoutMs = 20_000,
): Promise<{ pending: number; release: () => void }> {
  const release = beginRenderAllPass();
  const result = await waitForAllDrawn(timeoutMs);
  return { ...result, release };
}

async function waitForAllDrawn(timeoutMs: number): Promise<{ pending: number }> {
  // Render-all also mounts every block a long list was still holding back
  // (progressive mount follows the same switch). That commit — and the
  // diagrams in it registering themselves — lands after this task, so count
  // what is pending only then (a macrotask: rAF stops in a hidden tab).
  await new Promise((r) => setTimeout(r, 0));
  if (pending.size === 0) return { pending: 0 };
  return new Promise((resolve) => {
    const done = () => {
      if (pending.size > 0) return;
      clearTimeout(timer);
      drawnWaiters.delete(done);
      resolve({ pending: 0 });
    };
    const timer = setTimeout(() => {
      drawnWaiters.delete(done);
      resolve({ pending: pending.size });
    }, timeoutMs);
    drawnWaiters.add(done);
  });
}

/** Print the live page with every diagram drawn. */
export async function printLivePage(): Promise<void> {
  const { pending: missing, release } = await renderAllDiagrams();
  // The pass closes when the print does (afterprint); a browser whose print()
  // returns at once still gets its afterprint.
  const close = () => {
    window.removeEventListener("afterprint", close);
    release();
  };
  window.addEventListener("afterprint", close);
  if (missing > 0) {
    const { toast } = await import("@/lib/toast");
    toast.warning(
      `${missing} diagram${missing === 1 ? " is" : "s are"} still drawing — they may print as placeholders. Try again in a moment.`,
    );
  }
  window.print();
}

/**
 * True once a print or page capture asked for EVERYTHING to render (the
 * render-all switch). Anything that renders lazily — diagrams, a long list
 * mounting in slices — follows it, so a print never shows a placeholder or a
 * "Showing 600 of N" cut.
 */
export function useRenderAllRequested(): boolean {
  return useSyncExternalStore(subscribe, () => renderAll, () => false);
}

/**
 * True once this diagram should draw: it came near the viewport, a render-all
 * was requested, or the browser cannot tell (no IntersectionObserver).
 */
export function useDrawWhenNear(ref: RefObject<HTMLElement | null>): {
  shouldDraw: boolean;
  markDrawn: () => void;
} {
  const all = useRenderAllRequested();
  const [near, setNear] = useState(false);
  const [token] = useState(() => Symbol("diagram"));

  useEffect(() => {
    pending.add(token);
    sleepers.set(token, () => setNear(true));
    scheduleIdleDraws();
    return () => {
      pending.delete(token);
      sleepers.delete(token);
      drawing.delete(token);
      for (const w of [...drawnWaiters]) w();
    };
  }, [token]);

  // Asked to draw (by the viewport or render-all): no longer an idle sleeper.
  useEffect(() => {
    if ((near || all) && sleepers.delete(token)) drawing.add(token);
  }, [near, all, token]);

  useEffect(() => {
    if (near || all) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      // Its own scroller, so the margin holds inside a panel or drawer too.
      { root: nearestScrollRoot(el), rootMargin: DRAW_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, all, ref]);

  const markDrawn = () => {
    // Drawn stays drawn when a render-all pass closes.
    setNear(true);
    drawing.delete(token);
    sleepers.delete(token);
    if (!pending.delete(token)) return;
    for (const w of [...drawnWaiters]) w();
    if (sleepers.size > 0) scheduleIdleDraws();
  };

  return { shouldDraw: all || near, markDrawn };
}
