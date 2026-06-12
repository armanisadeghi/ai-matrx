// components/diff/text/engine/wordDiff.ts
//
// Intra-line word/character level diff. Produces two segment lists (one for
// each side) so the renderer can underline/highlight exactly what changed
// within a modified line pair. Backed by the same LCS approach used for
// lines, just over a token stream.

import type { WordGranularity, WordSegment } from "./types";

/** Split a line into diffable tokens, preserving whitespace as its own
 * tokens so highlighting aligns naturally. */
function tokenize(line: string, granularity: WordGranularity): string[] {
  if (granularity === "character") return Array.from(line);
  // Words = maximal runs of non-space; whitespace runs kept as separate
  // tokens. This keeps spaces in the output so reconstructed text is exact.
  const matches = line.match(/\s+|\S+/g);
  return matches ?? [];
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function mergeSegments(segments: WordSegment[]): WordSegment[] {
  const merged: WordSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.value += seg.value;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export interface WordDiff {
  /** Segments describing the OLD line (unchanged + removed). */
  left: WordSegment[];
  /** Segments describing the NEW line (unchanged + added). */
  right: WordSegment[];
}

/**
 * Compute word/char-level segments for a single changed line pair.
 * `left` reconstructs `oldLine`, `right` reconstructs `newLine`.
 */
export function computeWordDiff(
  oldLine: string,
  newLine: string,
  granularity: WordGranularity = "word",
): WordDiff {
  const a = tokenize(oldLine, granularity);
  const b = tokenize(newLine, granularity);
  const dp = lcsTable(a, b);

  const leftRev: WordSegment[] = [];
  const rightRev: WordSegment[] = [];

  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      leftRev.push({ type: "unchanged", value: a[i - 1] });
      rightRev.push({ type: "unchanged", value: b[j - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      leftRev.push({ type: "removed", value: a[i - 1] });
      i--;
    } else {
      rightRev.push({ type: "added", value: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    leftRev.push({ type: "removed", value: a[i - 1] });
    i--;
  }
  while (j > 0) {
    rightRev.push({ type: "added", value: b[j - 1] });
    j--;
  }

  leftRev.reverse();
  rightRev.reverse();

  return {
    left: mergeSegments(leftRev),
    right: mergeSegments(rightRev),
  };
}
