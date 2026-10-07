// features/spaces/editor/rubber-band.ts — B11: drag from the page margin draws a box; every block it
// touches is selected (blue), and the selected blocks act together: Backspace / Delete removes them,
// Cmd+D duplicates them, and the ⋮⋮ menu and selection menus act on all of them (the editor's own
// selection spans them, so `selectedOrCurrent` sees every one).
//
// The highlight is a <style> rule keyed by block id — never a class on ProseMirror's DOM.

import { useEffect } from "react";

import { duplicateBlocks } from "./block-actions";
import type { SpacesEditor } from "./schema";

const STYLE_ID = "spaces-rubber-band";
const START_PX = 5;

/** Where a band may begin: the page around the text column, never on a control or inside the text. */
function canStart(target: HTMLElement): boolean {
  if (!target.closest(".spaces-scroll")) return false;
  if (target.closest(".bn-editor, .spaces-header, .spaces-db-frame, .spaces-toc, .spaces-trash-banner, input, textarea, a, [role='dialog'], [role='menu']")) return false;
  const button = target.closest("button");
  return !button || button.classList.contains("spaces-page-end");
}

function paint(ids: string[]) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = ids
    .map((id) => `.spaces-editor .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block{background:var(--spaces-select, rgba(35,131,226,0.14));border-radius:4px}`)
    .join("\n");
}

/** The blocks the box touches, outermost only (a selected block brings its children). */
function blocksIn(box: DOMRect): string[] {
  const out: string[] = [];
  const picked = new Set<Element>();
  for (const outer of document.querySelectorAll<HTMLElement>(".spaces-editor .bn-block-outer[data-id]")) {
    const own = outer.querySelector<HTMLElement>(":scope > .bn-block > .bn-block-content") ?? outer;
    const r = own.getBoundingClientRect();
    const hit = r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
    if (!hit) continue;
    const parent = outer.parentElement?.closest(".bn-block-outer[data-id]");
    if (parent && picked.has(parent)) continue;
    picked.add(outer);
    out.push(outer.dataset.id!);
  }
  return out;
}

/**
 * A plain click in the margin beside a line puts the caret on that line (Notion): its end when the click
 * is right of the text, its start when left. The innermost block whose row holds `y` and that takes text.
 * Without this the click focused nothing and the next keys — a "/" command — went nowhere.
 */
export function lineBeside(x: number, y: number): { id: string; side: "start" | "end" } | null {
  let best: { id: string; side: "start" | "end"; depth: number; dist: number } | null = null;
  for (const outer of document.querySelectorAll<HTMLElement>(".spaces-editor .bn-block-outer[data-id]")) {
    const own = outer.querySelector<HTMLElement>(":scope > .bn-block > .bn-block-content");
    if (!own || !own.querySelector(".bn-inline-content")) continue;
    const r = own.getBoundingClientRect();
    if (y < r.top || y > r.bottom) continue;
    let depth = 0;
    for (let at = outer.parentElement?.closest(".bn-block-outer"); at; at = at.parentElement?.closest(".bn-block-outer")) depth++;
    const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    // The line nearest the click horizontally (columns sit side by side), then the innermost.
    if (!best || dist < best.dist || (dist === best.dist && depth > best.depth)) {
      best = { id: outer.dataset.id!, side: x < r.left ? "start" : "end", depth, dist };
    }
  }
  return best ? { id: best.id, side: best.side } : null;
}

export function useRubberBand(editor: SpacesEditor, editable: boolean) {
  useEffect(() => {
    if (!editable) return;
    let selected: string[] = [];
    let start: { x: number; y: number } | null = null;
    let band: HTMLDivElement | null = null;
    let swallowClick = false;

    const clear = () => {
      selected = [];
      paint([]);
    };

    const onDown = (e: MouseEvent) => {
      const inMenu = e.target instanceof HTMLElement && e.target.closest(".bn-side-menu, [role='menu'], .bn-menu-dropdown");
      if (selected.length && !inMenu) clear();
      if (e.button !== 0 || !(e.target instanceof HTMLElement) || !canStart(e.target)) return;
      start = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: MouseEvent) => {
      if (!start) return;
      if (!band && Math.hypot(e.clientX - start.x, e.clientY - start.y) < START_PX) return;
      e.preventDefault();
      if (!band) {
        band = document.createElement("div");
        band.className = "spaces-rubber-band";
        document.body.appendChild(band);
        window.getSelection()?.removeAllRanges();
      }
      const left = Math.min(start.x, e.clientX);
      const top = Math.min(start.y, e.clientY);
      const width = Math.abs(e.clientX - start.x);
      const height = Math.abs(e.clientY - start.y);
      Object.assign(band.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      selected = blocksIn(new DOMRect(left, top, width, height));
      paint(selected);
    };

    const onUp = (e: MouseEvent) => {
      if (band) {
        band.remove();
        band = null;
        swallowClick = true;
        window.setTimeout(() => (swallowClick = false), 0);
        if (selected.length) {
          // The editor's own selection spans the blocks, so menus and shortcuts act on all of them.
          try {
            editor.setSelection(selected[0], selected[selected.length - 1]);
          } catch {
            // A block with no text at an end (a database, a divider): the blue selection still acts on Delete.
          }
        }
      } else if (start && e.button === 0) {
        const line = lineBeside(start.x, start.y);
        if (line) {
          try {
            editor.setTextCursorPosition(line.id, line.side);
            editor.focus();
          } catch {
            // The line went away between press and release: the click stays a plain click.
          }
        }
      }
      start = null;
    };

    const onClick = (e: MouseEvent) => {
      if (swallowClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (!selected.length) return;
      if (e.target instanceof HTMLElement && e.target.matches("input, textarea")) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        editor.removeBlocks(selected);
        clear();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopPropagation();
        duplicateBlocks(editor, selected);
        clear();
      } else if (e.key === "Escape") {
        clear();
      } else if (!["Shift", "Meta", "Control", "Alt"].includes(e.key) && !(e.metaKey || e.ctrlKey)) {
        clear();
      }
    };

    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      band?.remove();
      paint([]);
    };
  }, [editor, editable]);
}
