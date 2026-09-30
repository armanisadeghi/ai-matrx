// components/selection-toolbar/selection-shape.ts
//
// THE LIVE SELECTION, WITH ITS SHAPE KEPT (SAVE-AS-TABLE-EVERYWHERE, VERIFIER-30 #1, BREAKER-3 B3-16).
// A browser selection over rendered content flattens a table's cells one per line and drops a list's
// bullets, so "Save to a table" found no rows in exactly what a person selects. This reads the
// selected DOM back into the shapes it was drawn from through records-ui's `shapeTextOfNode` — the
// one reader — for the selection toolbar AND the right-click menu's registry action.

import { shapeTextOfNode } from "@ai-matrx/records-ui/table-shape";

export function liveSelectionShapeText(): string | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const host = range.commonAncestorContainer;
  const el = host.nodeType === 1 ? (host as Element) : host.parentElement;
  if (el?.closest("textarea, input, [contenteditable='true']")) return null;
  const text = shapeTextOfNode(range.cloneContents());
  return text.trim() ? text : null;
}
