// lib/content-cleanup/review.ts
//
// Turns a cleanup into review cards grouped BY operation — one card per kind of
// change ("Removed spaces at the end of lines"), each with a count and a few
// real before/after examples drawn from the actual edits. This is what normal
// people review: plain language + see exactly what changes, not a git diff.
//
// Apply is still the real engine (cleanContent with the accepted operations);
// these cards are the explanation, not the source of truth.

import { getProtectedRegions } from "./segment";
import { CLEANUP_OPERATIONS, type CleanupEdit } from "./operations";
import type { CleanupOperationId } from "./types";

/** A single before/after example for a change card. */
export type ChangeExample =
  | {
      kind: "line";
      /** The affected line as it is now. */
      line: string;
      /** Range within `line` that will change (to render visibly). */
      markStart: number;
      markEnd: number;
      /** The line after the change. */
      after: string;
    }
  | {
      kind: "block";
      /** e.g. "3 blank lines". */
      nowLabel: string;
      /** e.g. "1 blank line" / "removed". */
      afterLabel: string;
    };

export interface OperationCard {
  id: CleanupOperationId;
  /** Plain-language headline, e.g. "Removed extra blank lines". */
  human: string;
  /** Total places this change applies. */
  count: number;
  /** A capped sample of before/after examples. */
  examples: ChangeExample[];
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

function blankPhrase(blanks: number): string {
  return `${blanks} blank line${blanks !== 1 ? "s" : ""}`;
}

function buildExample(content: string, edit: CleanupEdit): ChangeExample {
  const removed = content.slice(edit.start, edit.end);

  // Multi-line edit (blank-line collapse / edge trim): describe structurally.
  if (removed.includes("\n")) {
    const blanksNow = Math.max(0, countNewlines(removed) - 1);
    const blanksAfter = Math.max(0, countNewlines(edit.replacement) - 1);
    return {
      kind: "block",
      nowLabel: blanksNow > 0 ? blankPhrase(blanksNow) : "blank space",
      afterLabel: edit.replacement === "" ? "removed" : blankPhrase(blanksAfter),
    };
  }

  // Single-line edit: show the line with the exact changed slice marked.
  const lineStart = content.lastIndexOf("\n", edit.start - 1) + 1;
  let lineEnd = content.indexOf("\n", edit.end);
  if (lineEnd === -1) lineEnd = content.length;
  const line = content.slice(lineStart, lineEnd);
  const markStart = edit.start - lineStart;
  const markEnd = edit.end - lineStart;
  const after =
    line.slice(0, markStart) + edit.replacement + line.slice(markEnd);
  return { kind: "line", line, markStart, markEnd, after };
}

/**
 * Build per-operation review cards for `content` under the enabled operations.
 * Edits are computed on the visible (non-protected) text so examples never
 * reach into code/JSON. Only operations that actually change something appear.
 */
export function buildOperationCards(
  content: string,
  enabledIds: Iterable<CleanupOperationId>,
  perOpLimit = 6,
): OperationCard[] {
  const enabled = new Set(enabledIds);
  const regions = getProtectedRegions(content);
  const isProtected = (start: number, end: number) =>
    regions.some((r) => start < r.end && r.start < end);

  const cards: OperationCard[] = [];
  for (const op of CLEANUP_OPERATIONS) {
    if (!enabled.has(op.id)) continue;
    const edits = op.edits(content).filter((e) => !isProtected(e.start, e.end));
    if (edits.length === 0) continue;
    cards.push({
      id: op.id,
      human: op.human,
      count: edits.length,
      examples: edits.slice(0, perOpLimit).map((e) => buildExample(content, e)),
    });
  }
  return cards;
}
