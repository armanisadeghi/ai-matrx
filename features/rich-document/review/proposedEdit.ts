// features/rich-document/review/proposedEdit.ts
//
// SAVE = SPLICE for an AI proposal. An agent hands back a WHOLE rewritten
// text; the store must only see the blocks that actually changed. This
// reduces (original, proposed) to ONE block-aligned edit — the run between the
// longest common leading and trailing blocks — and applies it with
// `spliceSave` from @ai-matrx/content-ir/source, so every untouched block is
// written back byte for byte and an island the proposal did not name can
// never be silently disturbed (the splice refuses with "integrity").

import {
  SourceSpliceError,
  spliceSave,
  tokenizeSource,
  type SourceEdit,
  type SpliceResult,
} from "@ai-matrx/content-ir/source";

export interface ProposedEdit {
  /** The one block-aligned edit, or null when nothing differs. */
  edit: SourceEdit | null;
  /** Blocks of the original that stay byte-identical. */
  keptBlocks: number;
  /** Blocks of the original the edit replaces. */
  replacedBlocks: number;
}

export function reduceToBlockEdit(
  original: string,
  proposed: string,
): ProposedEdit {
  const a = tokenizeSource(original);
  const b = tokenizeSource(proposed);
  let head = 0;
  while (head < a.length && head < b.length && a[head].raw === b[head].raw) {
    head += 1;
  }
  if (head === a.length && head === b.length) {
    return { edit: null, keptBlocks: a.length, replacedBlocks: 0 };
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail].raw === b[b.length - 1 - tail].raw
  ) {
    tail += 1;
  }
  const oldFirst = head;
  const oldLast = a.length - 1 - tail; // may be < oldFirst (pure insertion)
  const start = oldFirst < a.length ? a[oldFirst].start : original.length;
  const end = oldLast >= oldFirst ? a[oldLast].end : start;
  const newStart = head < b.length ? b[head].start : proposed.length;
  const newEnd =
    b.length - 1 - tail >= head ? b[b.length - 1 - tail].end : newStart;
  return {
    edit: { start, end, text: proposed.slice(newStart, newEnd) },
    keptBlocks: head + tail,
    replacedBlocks: Math.max(0, oldLast - oldFirst + 1),
  };
}

/**
 * The text to persist for a proposal: `original` with only the changed run
 * spliced in. Throws `SourceSpliceError` when the splice would disturb an
 * island it did not name — the caller surfaces that, never forces it.
 */
export function spliceProposal(
  original: string,
  proposed: string,
): SpliceResult | null {
  const { edit } = reduceToBlockEdit(original, proposed);
  if (!edit) return null;
  return spliceSave(original, [edit]);
}

/**
 * A splice refusal in words a person reads — never offsets or function names
 * ("edit [0, 776) changes … island at [141, 233); islands change only through
 * islandEdit()" was shown verbatim, verify-RC-B5 round 3 F7).
 */
export function explainSpliceRefusal(error: unknown): string {
  const code = error instanceof SourceSpliceError ? error.code : null;
  if (code === "island_edit" || code === "integrity") {
    return "This change would alter protected content — code, math, a table, a section or hidden reasoning — which is only changed in its own editor.";
  }
  return "This change could not be placed exactly into the saved text.";
}
