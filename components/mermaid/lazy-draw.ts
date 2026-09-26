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

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** How far outside the viewport a diagram starts drawing. */
export const DRAW_MARGIN = "1200px 0px";

let renderAll = false;
const listeners = new Set<() => void>();
/** Diagrams mounted but not yet drawn. */
const pending = new Set<symbol>();
const drawnWaiters = new Set<() => void>();
/** Pending diagrams not yet asked to draw, and how to ask each one. */
const sleepers = new Map<symbol, () => void>();
/** Asked to draw (near the viewport or by the idle queue) but not drawn yet. */
const drawing = new Set<symbol>();

/** Diagrams the idle queue wakes per idle period. */
export const IDLE_BATCH = 2;
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
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 200);
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeprint", () => {
    if (!renderAll) {
      renderAll = true;
      emit();
    }
  });
}

/**
 * Draw every diagram now. Resolves when all mounted diagrams have drawn, or
 * after `timeoutMs` with the number still pending (never silently).
 */
export function renderAllDiagrams(timeoutMs = 20_000): Promise<{ pending: number }> {
  renderAll = true;
  emit();
  if (pending.size === 0) return Promise.resolve({ pending: 0 });
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
  const { pending: missing } = await renderAllDiagrams();
  if (missing > 0) {
    const { toast } = await import("@/lib/toast");
    toast.warning(
      `${missing} diagram${missing === 1 ? " is" : "s are"} still drawing — they may print as placeholders. Try again in a moment.`,
    );
  }
  window.print();
}

/**
 * True once this diagram should draw: it came near the viewport, a render-all
 * was requested, or the browser cannot tell (no IntersectionObserver).
 */
export function useDrawWhenNear(ref: RefObject<HTMLElement | null>): {
  shouldDraw: boolean;
  markDrawn: () => void;
} {
  const all = useSyncExternalStore(subscribe, () => renderAll, () => false);
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
      { rootMargin: DRAW_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, all, ref]);

  const markDrawn = () => {
    drawing.delete(token);
    sleepers.delete(token);
    if (!pending.delete(token)) return;
    for (const w of [...drawnWaiters]) w();
    if (sleepers.size > 0) scheduleIdleDraws();
  };

  return { shouldDraw: all || near, markDrawn };
}
