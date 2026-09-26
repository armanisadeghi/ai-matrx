// components/mermaid/lazy-draw.ts
//
// 🚨 A DIAGRAM IS DRAWN WHEN SOMEONE CAN SEE IT — AND EVERY ONE IS DRAWN BEFORE A
// PRINT. Mermaid measures text with getBBox for every label, so drawing ~50
// diagrams on paste held a 5 MB document's main thread for ~9 s (the markdown
// tester crash, 2026-09-26). A diagram now draws when its placeholder comes
// within DRAW_MARGIN of the viewport.
//
// THE RENDER-ALL PATH. Anything that captures or prints the live page must
// call `renderAllDiagrams()` first (it resolves when every mounted diagram has
// drawn, or says how many did not); `printLivePage()` does that and then opens
// the browser's print. A browser print the app did not start (⌘P) still sets
// the flag through `beforeprint`, so every diagram draws — the print that is
// already under way may show placeholders, and says nothing false: a
// placeholder is a labelled skeleton.

"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** How far outside the viewport a diagram starts drawing. */
export const DRAW_MARGIN = "1200px 0px";

let renderAll = false;
const listeners = new Set<() => void>();
/** Diagrams mounted but not yet drawn. */
const pending = new Set<symbol>();
const drawnWaiters = new Set<() => void>();

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
    return () => {
      pending.delete(token);
      for (const w of [...drawnWaiters]) w();
    };
  }, [token]);

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
    if (!pending.delete(token)) return;
    for (const w of [...drawnWaiters]) w();
  };

  return { shouldDraw: all || near, markDrawn };
}
