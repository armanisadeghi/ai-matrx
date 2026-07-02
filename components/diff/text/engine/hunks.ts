// components/diff/text/engine/hunks.ts
//
// Per-hunk model on top of the canonical line diff. A "hunk" is a maximal run
// of consecutive changed lines (removals and/or additions) bounded by unchanged
// lines — the unit a human accepts or rejects. This turns the read-only diff
// into a merge tool: pick which hunks to take, get the merged text back.

import { computeTextDiff } from "./computeTextDiff";
import type { TextDiffOptions } from "./types";

export interface DiffHunk {
  /** 0-based index in document order. */
  index: number;
  /** Old-side lines this hunk removes (empty for a pure addition). */
  removed: string[];
  /** New-side lines this hunk adds (empty for a pure deletion). */
  added: string[];
  /** 1-based old-side line where the hunk starts (for display), or null. */
  oldStart: number | null;
  /** 1-based new-side line where the hunk starts (for display), or null. */
  newStart: number | null;
}

/** Group the inline diff into accept/reject-able hunks. */
export function getHunks(
  original: string,
  modified: string,
  options?: TextDiffOptions,
): DiffHunk[] {
  const { inline } = computeTextDiff(original, modified, options);
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < inline.length) {
    if (inline[i].type === "unchanged") {
      i++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    let oldStart: number | null = null;
    let newStart: number | null = null;
    while (i < inline.length && inline[i].type !== "unchanged") {
      const line = inline[i];
      if (line.type === "removed") {
        removed.push(line.content);
        if (oldStart === null) oldStart = line.oldLineNumber;
      } else {
        added.push(line.content);
        if (newStart === null) newStart = line.newLineNumber;
      }
      i++;
    }
    hunks.push({ index: hunks.length, removed, added, oldStart, newStart });
  }
  return hunks;
}

/**
 * Reconstruct the merged text: unchanged lines are always kept; for each hunk,
 * an accepted index takes the NEW (added) lines, otherwise the OLD (removed)
 * lines are kept. Accepting a pure-addition hunk inserts it; rejecting a
 * pure-deletion hunk keeps the old lines. Passing every hunk index yields
 * `modified` exactly; passing none yields `original`.
 */
export function applyHunks(
  original: string,
  modified: string,
  acceptedIndices: Iterable<number>,
  options?: TextDiffOptions,
): string {
  const accepted = new Set(acceptedIndices);
  const { inline } = computeTextDiff(original, modified, options);
  const out: string[] = [];
  let hunkIndex = -1;
  let i = 0;
  while (i < inline.length) {
    const line = inline[i];
    if (line.type === "unchanged") {
      out.push(line.content);
      i++;
      continue;
    }
    hunkIndex++;
    const removed: string[] = [];
    const added: string[] = [];
    while (i < inline.length && inline[i].type !== "unchanged") {
      if (inline[i].type === "removed") removed.push(inline[i].content);
      else added.push(inline[i].content);
      i++;
    }
    out.push(...(accepted.has(hunkIndex) ? added : removed));
  }
  return out.join("\n");
}
