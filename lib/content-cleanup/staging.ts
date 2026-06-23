// lib/content-cleanup/staging.ts
//
// Per-hunk staging on top of the canonical text diff engine. Groups the
// unified diff into "segments" — runs of unchanged lines and discrete change
// "hunks" — so the review UI can accept/reject each hunk independently, and
// can reconstruct the resulting content from any subset of accepted hunks.
//
// Invariants (round-trip safety):
//   reconstruct(segments, ALL hunks)  === cleaned
//   reconstruct(segments, NO hunks)   === original
// Anything in between is a valid partial-accept of the cleanup.

import { computeTextDiff } from "@/components/diff/text/engine/computeTextDiff";
import type {
  TextDiffStats,
  WordSegment,
} from "@/components/diff/text/engine/types";

export interface DiffLine {
  content: string;
  /** Word-level highlight segments for a modified pair, when available. */
  segments?: WordSegment[];
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface UnchangedSegment {
  kind: "unchanged";
  lines: DiffLine[];
}

export interface HunkSegment {
  kind: "hunk";
  /** Stable index among hunks (0-based) — the staging key. */
  index: number;
  removed: DiffLine[];
  added: DiffLine[];
}

export type DiffSegment = UnchangedSegment | HunkSegment;

export interface DiffSegmentsResult {
  segments: DiffSegment[];
  hunkCount: number;
  stats: TextDiffStats;
  hasChanges: boolean;
}

/** Compute the staged-diff segment list between original and cleaned content. */
export function buildDiffSegments(
  original: string,
  cleaned: string,
): DiffSegmentsResult {
  const result = computeTextDiff(original, cleaned, {
    wordLevel: true,
    granularity: "word",
  });

  const segments: DiffSegment[] = [];
  let hunkIndex = 0;
  let i = 0;
  const inline = result.inline;

  while (i < inline.length) {
    const line = inline[i];
    if (line.type === "unchanged") {
      const lines: DiffLine[] = [];
      while (i < inline.length && inline[i].type === "unchanged") {
        const u = inline[i];
        lines.push({
          content: u.content,
          oldLineNumber: u.oldLineNumber,
          newLineNumber: u.newLineNumber,
        });
        i++;
      }
      segments.push({ kind: "unchanged", lines });
      continue;
    }

    // A change block: a run of removed and/or added lines.
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < inline.length && inline[i].type !== "unchanged") {
      const c = inline[i];
      const dl: DiffLine = {
        content: c.content,
        segments: c.segments,
        oldLineNumber: c.oldLineNumber,
        newLineNumber: c.newLineNumber,
      };
      if (c.type === "removed") removed.push(dl);
      else added.push(dl);
      i++;
    }
    segments.push({ kind: "hunk", index: hunkIndex, removed, added });
    hunkIndex++;
  }

  return {
    segments,
    hunkCount: hunkIndex,
    stats: result.stats,
    hasChanges: result.hasChanges,
  };
}

/**
 * Rebuild content from the diff segments, applying only the accepted hunks.
 * Accepted hunk -> use its "added" lines; rejected hunk -> keep its "removed"
 * lines (i.e. the original). Unchanged lines are always kept.
 */
export function reconstructFromSegments(
  segments: DiffSegment[],
  acceptedHunks: ReadonlySet<number>,
): string {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "unchanged") {
      for (const l of seg.lines) out.push(l.content);
    } else {
      const use = acceptedHunks.has(seg.index) ? seg.added : seg.removed;
      for (const l of use) out.push(l.content);
    }
  }
  return out.join("\n");
}
