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
import { CLEANUP_REGION_OPERATIONS } from "./region-operations";
import type {
  CleanupOperationId,
  CleanupRegionOperationId,
  CleanupReport,
} from "./types";

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
    }
  | {
      /** A whole protected region re-printed (JSON condense / minify / expand).
       *  Shown as real before/after text, not a character-level mark. */
      kind: "region";
      before: string;
      after: string;
      /** e.g. "11 lines" / "3 lines". */
      nowLabel: string;
      afterLabel: string;
    };

export interface ReviewCard<TId extends string> {
  id: TId;
  /** Plain-language headline, e.g. "Removed extra blank lines". */
  human: string;
  /** Total places this change applies. */
  count: number;
  /** A capped sample of before/after examples. */
  examples: ChangeExample[];
}

export type OperationCard = ReviewCard<CleanupOperationId>;
export type RegionOperationCard = ReviewCard<CleanupRegionOperationId>;

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

/** Clip a region preview so a 400-line JSON blob can't blow out the dialog. */
function clipRegion(text: string, maxLines = 14): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [
    ...lines.slice(0, maxLines),
    `… ${lines.length - maxLines} more line${lines.length - maxLines !== 1 ? "s" : ""}`,
  ].join("\n");
}

function linePhrase(n: number): string {
  return `${n} line${n !== 1 ? "s" : ""}`;
}

/**
 * Build review cards for the REGION operations, from a report the engine
 * already produced. Unlike `buildOperationCards` these are not re-derived from
 * the source text — a region rewrite is a parse+re-print, so the report's
 * recorded before/after IS the truth.
 */
export function buildRegionOperationCards(
  report: CleanupReport,
  perOpLimit = 4,
): RegionOperationCard[] {
  const cards: RegionOperationCard[] = [];
  for (const op of CLEANUP_REGION_OPERATIONS) {
    const changes = report.regionChanges.filter((c) => c.opId === op.id);
    if (changes.length === 0) continue;
    cards.push({
      id: op.id,
      human: op.human,
      count: changes.length,
      examples: changes.slice(0, perOpLimit).map((c) => ({
        kind: "region" as const,
        before: clipRegion(c.before),
        after: clipRegion(c.after),
        nowLabel: linePhrase(c.linesBefore),
        afterLabel: linePhrase(c.linesAfter),
      })),
    });
  }
  return cards;
}
