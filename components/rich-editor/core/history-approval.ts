// components/rich-editor/core/history-approval.ts
//
// Undo and redo are deliberate. An undo that takes an island back to earlier
// bytes (the equation before its edit, a variable before its rename) is the
// person reversing their own island edit — the save gate must not ask about it
// as if the editor had changed protected content on its own.
//
// The save gate approves an island change by the island's BEFORE bytes (what
// the stored text holds). So for every undo/redo transaction, the island raws
// it took away are approved: whichever of them the stored text holds, the
// reversal is the person's own. An island the history step did not touch is
// never approved here.

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";

/** prosemirror-history's plugin key — the meta it puts on every undo/redo. */
const HISTORY_META = "history$";

const ISLAND_TYPES = new Set(["islandBlock", "inlineIsland", "sourceLocked"]);

function islandRaws(doc: PMNode): Map<string, number> {
  const counts = new Map<string, number>();
  doc.descendants((node) => {
    if (!ISLAND_TYPES.has(node.type.name)) return true;
    const raw = String(node.attrs.raw ?? "");
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    return false;
  });
  return counts;
}

/** True when the transaction is an undo or a redo. */
export function isHistoryTransaction(tr: Transaction): boolean {
  return tr.getMeta(HISTORY_META) !== undefined;
}

/**
 * The island raws an undo/redo transaction took out of the document (as a
 * multiset difference, so one of two identical islands counts). Empty for
 * every other transaction.
 */
export function islandsReleasedByHistory(tr: Transaction): string[] {
  if (!tr.docChanged || !isHistoryTransaction(tr)) return [];
  const before = islandRaws(tr.before);
  const after = islandRaws(tr.doc);
  const released: string[] = [];
  for (const [raw, count] of before) {
    if ((after.get(raw) ?? 0) < count) released.push(raw);
  }
  return released;
}

/** The same rule for plain text (the Source view): island raws an undo/redo took out. */
export function islandsReleasedBetweenTexts(before: string, after: string): string[] {
  const count = (text: string) => {
    const counts = new Map<string, number>();
    for (const island of listIslands(tokenizeSource(text))) counts.set(island.raw, (counts.get(island.raw) ?? 0) + 1);
    return counts;
  };
  const was = count(before);
  const now = count(after);
  const released: string[] = [];
  for (const [raw, n] of was) if ((now.get(raw) ?? 0) < n) released.push(raw);
  return released;
}
