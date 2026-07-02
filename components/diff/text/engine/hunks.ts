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

/** A run of unchanged lines between hunks — foldable in the UI. */
export interface ContextBlock {
  kind: "context";
  lines: string[];
  /** True when a hunk immediately precedes / follows this block (so its
   * adjacent lines are the meaningful context to keep visible when folded). */
  hasPrevHunk: boolean;
  hasNextHunk: boolean;
}

export interface HunkBlock {
  kind: "hunk";
  index: number;
  removed: string[];
  added: string[];
}

export type DiffStructureItem = ContextBlock | HunkBlock;

/**
 * Compute the whole diff ONCE into an ordered list of context blocks + hunks.
 * Renderers derive everything (folding, per-hunk resolution, the merged result)
 * from this without re-running the O(n·m) LCS — critical for large files where
 * re-diffing on every interaction stalls the UI.
 */
export function getDiffStructure(
  original: string,
  modified: string,
  options?: TextDiffOptions,
): { items: DiffStructureItem[]; hunkCount: number } {
  const { inline } = computeTextDiff(original, modified, options);
  const items: DiffStructureItem[] = [];
  let i = 0;
  let hunkIndex = 0;
  while (i < inline.length) {
    if (inline[i].type === "unchanged") {
      const lines: string[] = [];
      while (i < inline.length && inline[i].type === "unchanged") {
        lines.push(inline[i].content);
        i++;
      }
      items.push({ kind: "context", lines, hasPrevHunk: false, hasNextHunk: false });
    } else {
      const removed: string[] = [];
      const added: string[] = [];
      while (i < inline.length && inline[i].type !== "unchanged") {
        if (inline[i].type === "removed") removed.push(inline[i].content);
        else added.push(inline[i].content);
        i++;
      }
      items.push({ kind: "hunk", index: hunkIndex, removed, added });
      hunkIndex++;
    }
  }
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.kind === "context") {
      it.hasPrevHunk = k > 0 && items[k - 1].kind === "hunk";
      it.hasNextHunk = k < items.length - 1 && items[k + 1].kind === "hunk";
    }
  }
  return { items, hunkCount: hunkIndex };
}

/**
 * Merge a precomputed structure given the set of ACCEPTED hunk indices —
 * pure and cheap (no re-diff). Accepted hunk → new lines; anything else
 * (pending or rejected) keeps the old lines. Empty set === original,
 * every index === modified.
 */
export function mergeFromDecisions(
  items: DiffStructureItem[],
  acceptedIndices: Set<number>,
): string {
  const out: string[] = [];
  for (const it of items) {
    if (it.kind === "context") out.push(...it.lines);
    else out.push(...(acceptedIndices.has(it.index) ? it.added : it.removed));
  }
  return out.join("\n");
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
