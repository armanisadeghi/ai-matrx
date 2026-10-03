/**
 * "+ ROW" ADDS A ROW IN THE GRID, WITH ITS FIRST CELL EDITING — AND EVERY KEY TYPED MEANWHILE LANDS
 * (grids review 3, 2026-09-30).
 *
 * MEASURED on the Sheet: "+ Row" opened a form whose focus landed on Cancel, and Tab walked through
 * each field's voice buttons; five of six fast-typed values were lost. The champion (Airtable, Google
 * Sheets, Notion) adds the row where the rows are and puts the person in its first cell, so typing
 * and Tab behave exactly as they do on every other row.
 *
 * The row does not exist until the store answers (a round trip and a re-read). Keys typed in that
 * window are the person's, so they are HELD — never dropped, never typed into whatever happened to
 * have focus — and given to the grid in order once the first cell is open: the letters before the
 * first Tab or Enter open that cell (its seed), and the rest go to the grid one key at a time, the
 * way a fast typist's keys reach it (`useGridSelection` already takes a key that arrives before an
 * editor has focus).
 *
 * A row the current search, filter or page does not show cannot be edited in place: that is said,
 * with where it went, never silent.
 */
"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

type Held = { key: string; shiftKey: boolean };

/** A key this flow holds: a character, Tab, Enter or Backspace, with no shortcut modifier. */
function isHeldKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key.length === 1 || e.key === "Tab" || e.key === "Enter" || e.key === "Backspace";
}

/** The letters typed before the first Tab or Enter — what the first cell opens with. */
export function splitHeldKeys(held: readonly Held[]): { seed: string; rest: Held[] } {
  let seed = "";
  let i = 0;
  for (; i < held.length; i++) {
    const k = held[i]!;
    if (k.key === "Tab" || k.key === "Enter") break;
    if (k.key === "Backspace") seed = seed.slice(0, -1);
    else seed += k.key;
  }
  return { seed, rest: held.slice(i) };
}

export function useInlineNewRow(options: {
  /** The grid's own focus target; held keys are handed to it. */
  containerRef: RefObject<HTMLElement | null>;
  /** Make the row in the store. */
  create: () => Promise<{ ok: true; rowId: string } | { ok: false; why: string }>;
  /** Re-read the page so the new row is drawn. */
  reload: () => Promise<void>;
  /** The rows on screen now (read after the re-read settles). */
  shownRowIds: () => readonly string[];
  /** Open the new row's first editable cell with these letters; false when it has none. */
  begin: (rowId: string, seed: string) => boolean;
  /** Focus the grid so keys typed now land on it. */
  focusGrid: () => void;
  onRefused: (why: string) => void;
  /** The row was made but the view does not show it (search, filter, sort or page). */
  onNotShown: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const busy = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAdding(true);
    const held: Held[] = [];
    const hold = (e: KeyboardEvent) => {
      // A key we hand to the grid ourselves is not held again.
      if (!e.isTrusted || !isHeldKey(e)) return;
      const target = e.target instanceof Element ? e.target : null;
      // Typing into another field (a search box, a dialog) is that field's.
      if (target && target.closest("input, textarea, [contenteditable=true]") && !target.closest("[data-grid-type-catcher]")) {
        if (!target.closest("[data-matrx-cell-editor]")) return;
      }
      e.preventDefault();
      e.stopPropagation();
      held.push({ key: e.key, shiftKey: e.shiftKey });
    };
    window.addEventListener("keydown", hold, true);
    const release = () => window.removeEventListener("keydown", hold, true);
    try {
      latest.current.focusGrid();
      const made = await latest.current.create();
      if (!made.ok) {
        release();
        latest.current.onRefused(made.why);
        return;
      }
      await latest.current.reload();
      // The re-read lands in state; wait for the frame that draws it (a few at most).
      let shown = false;
      for (let i = 0; i < 30 && !shown; i++) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        shown = latest.current.shownRowIds().includes(made.rowId);
      }
      if (!shown) {
        release();
        latest.current.onNotShown();
        return;
      }
      // Keys keep being held while they are handed over, so a key typed now stays in order.
      const first = splitHeldKeys(held.splice(0, held.length));
      const queue: Held[] = [...first.rest];
      if (!latest.current.begin(made.rowId, first.seed)) {
        release();
        return;
      }
      for (;;) {
        await new Promise((r) => setTimeout(r, 60));
        if (held.length > 0) queue.push(...held.splice(0, held.length));
        const next = queue.shift();
        if (!next) break;
        latest.current.containerRef.current?.dispatchEvent(
          new KeyboardEvent("keydown", { key: next.key, shiftKey: next.shiftKey, bubbles: true, cancelable: true }),
        );
      }
      release();
    } catch (err) {
      release();
      latest.current.onRefused(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
      setAdding(false);
    }
  }, []);

  return { start, adding };
}
