/**
 * A BLOCK INSERTED "BEFORE" / "AFTER" THE SELECTION LANDS BETWEEN BLOCKS —
 * never inside a word, and from ANY selection.
 *
 * `insertText(text, "after")` used to split the paragraph AT the caret, so a
 * reference inserted with the caret inside "of" became "o" + block + "f"
 * (G5 review, 2026-10-02). Then it split at the caret textblock's edge — which
 * threw `TransformError: Inserted content deeper than insertion position`
 * whenever the selection was NOT in a textblock: a selected island (the chip a
 * previous insert left selected), ⌘A, a position between two top-level blocks
 * (G8B review, 2026-10-02: picking a chat after a right-click with no click in
 * the text did nothing and left the dialog open).
 *
 * Now the block goes to the TOP-LEVEL boundary beside the selection's block
 * (before its start / after its end) — a position that exists for every
 * selection — and the caret lands just after what was inserted. Guard:
 * `__tests__/block-insert.test.ts` sweeps every position × selection kind.
 */
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Selection } from "@tiptap/pm/state";
import { markdownToSlice } from "./paste-markdown";

/** The top-level boundary a block goes to, relative to [from, to]. */
export function blockInsertPosition(
  doc: PMNode,
  from: number,
  to: number,
  where: "before" | "after",
): number {
  const clamp = (pos: number) => Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamp(where === "before" ? from : to));
  // Depth 0: already between two top-level blocks (or at an edge of the doc).
  if ($pos.depth === 0) return $pos.pos;
  return where === "before" ? $pos.before(1) : $pos.after(1);
}

/**
 * Insert markdown as its own block(s) before / after the selection's block.
 * Throws nothing it can avoid; returns false when the text parses to nothing.
 */
export function insertMarkdownBlock(
  tr: Transaction,
  schema: Schema,
  text: string,
  where: "before" | "after",
): boolean {
  const { from, to } = tr.selection;
  const at = blockInsertPosition(tr.doc, from, to, where);
  const parsed = markdownToSlice(text, schema);
  if (parsed.size === 0) return false;
  // A CLOSED slice of whole blocks: the doc takes `block+` at every boundary.
  const blocks = new Slice(Fragment.from(parsed.content), 0, 0);
  tr.replace(at, at, blocks);
  const end = tr.mapping.map(at, 1);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), 1));
  return true;
}
