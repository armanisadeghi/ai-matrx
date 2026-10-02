/**
 * A BLOCK INSERTED "BEFORE" / "AFTER" THE SELECTION LANDS BETWEEN BLOCKS —
 * never inside a word.
 *
 * `insertText(text, "after")` used to split the paragraph AT the caret, so a
 * reference inserted with the caret inside "of" became "o" + block + "f"
 * (G5 review, 2026-10-02). The block now goes after the END of the caret's
 * textblock ("after") or before its START ("before"); outside a textblock the
 * selection edge is used as it is.
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Schema } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { replaceSelectionWithMarkdown } from "./paste-markdown";

/** The document position a block goes to, relative to the selection. */
export function blockInsertPosition(
  doc: PMNode,
  from: number,
  to: number,
  where: "before" | "after",
): number {
  const $pos = doc.resolve(where === "before" ? from : to);
  if (!$pos.parent.isTextblock) return $pos.pos;
  return where === "before" ? $pos.start() : $pos.end();
}

/** Insert markdown as its own block before / after the selection's block. */
export function insertMarkdownBlock(
  tr: Transaction,
  schema: Schema,
  text: string,
  where: "before" | "after",
): void {
  const { from, to } = tr.selection;
  const at = blockInsertPosition(tr.doc, from, to, where);
  tr.setSelection(TextSelection.create(tr.doc, at));
  tr.split(at);
  replaceSelectionWithMarkdown(tr, schema, text);
}
