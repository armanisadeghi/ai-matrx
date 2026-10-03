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

/** The open cell's text box, when its editor is one (text, number, date, a choice's search). */
function editorTextBox(container: HTMLElement | null | undefined): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    (container?.contains(active) || active.closest("[data-matrx-cell-editor]") || active.closest("[cmdk-root]"))
  ) {
    return active;
  }
  return container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "[data-matrx-cell-editor] textarea, [data-matrx-cell-editor] input[type=text], [data-matrx-cell-editor] input:not([type])",
  ) ?? null;
}

/** Insert one character at the caret the way a key would, so React's onChange sees it. */
function typeInto(box: HTMLInputElement | HTMLTextAreaElement, ch: string) {
  const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? box.value.length;
  setValue?.call(box, box.value.slice(0, start) + ch + box.value.slice(end));
  box.setSelectionRange?.(start + ch.length, start + ch.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
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
    const ours = new WeakSet<Event>();
    const hold = (e: KeyboardEvent) => {
      // A key we hand to the grid ourselves is not held again.
      if (ours.has(e) || !isHeldKey(e)) return;
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
      // Each key waits for the grid to have answered the one before — a Tab has closed its cell, a
      // letter has opened one — however slow the machine. A fixed gap was measured losing every key
      // after the first Tab on a loaded preview (the next letter reached a grid still mid-commit).
      const container = () => latest.current.containerRef.current;
      const editorOpen = () => Boolean(container()?.querySelector("[data-matrx-cell-editor]"));
      const until = async (done: () => boolean) => {
        for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 30));
      };
      await until(editorOpen);
      for (;;) {
        if (held.length > 0) queue.push(...held.splice(0, held.length));
        const next = queue.shift();
        if (!next) {
          // A key typed while the last one was handed over still belongs here.
          await new Promise((r) => setTimeout(r, 60));
          if (held.length === 0) break;
          continue;
        }
        const wasOpen = editorOpen();
        // A character for an open cell goes INTO its text box, as typing would (the grid's own key path
        // drops a lone space, measured: "Belt checked" landed as "Beltchecked"). Everything else — a key
        // that opens a cell, Tab, Enter — goes to the grid.
        // Tab and Enter for an open cell go to that cell's own text box too: its key handler commits and
        // moves, exactly as a typed Tab does. (Sent to the grid instead, the commit request never reached
        // the Sheet's memoised row — measured: the Title stayed open holding "Rowing machine".)
        const box = wasOpen ? editorTextBox(container()) : null;
        if (box && next.key.length === 1) {
          typeInto(box, next.key);
        } else {
          const event = new KeyboardEvent("keydown", { key: next.key, shiftKey: next.shiftKey, bubbles: true, cancelable: true });
          ours.add(event);
          (box ?? container())?.dispatchEvent(event);
        }
        if (next.key === "Tab" || next.key === "Enter") await until(() => !editorOpen());
        else if (!wasOpen) await until(editorOpen);
        else await new Promise((r) => setTimeout(r, 15));
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
