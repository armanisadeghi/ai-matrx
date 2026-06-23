// components/diff/text/engine/computeTextDiff.ts
//
// Canonical line-level text diff. Consolidates the two legacy hand-rolled
// LCS implementations (features/code-editor/utils/generateDiff.ts and
// features/notes/utils/diffAnalysis.ts) into one engine that emits BOTH the
// inline (unified) and aligned (split) representations, with optional
// word-level highlighting on changed line pairs.

import { computeWordDiff } from "./wordDiff";
import type {
  DiffRow,
  InlineDiffLine,
  LineChangeType,
  TextDiffOptions,
  TextDiffResult,
  TextDiffStats,
  WordSegment,
} from "./types";

type LineOp =
  | { type: "unchanged"; oldIndex: number; newIndex: number }
  | { type: "removed"; oldIndex: number }
  | { type: "added"; newIndex: number };

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

function computeLineOps(oldLines: string[], newLines: string[]): LineOp[] {
  const dp = lcsTable(oldLines, newLines);
  const ops: LineOp[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: "unchanged", oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "removed", oldIndex: i - 1 });
      i--;
    } else {
      ops.push({ type: "added", newIndex: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ type: "removed", oldIndex: i - 1 });
    i--;
  }
  while (j > 0) {
    ops.push({ type: "added", newIndex: j - 1 });
    j--;
  }
  ops.reverse();
  return ops;
}

/** Ratio of characters in `unchanged` segments — used to decide whether
 * a removed/added pair is a "modification" worth word-highlighting versus
 * two unrelated lines. */
function similarity(segments: WordSegment[], total: number): number {
  if (total === 0) return 1;
  const same = segments
    .filter((s) => s.type === "unchanged")
    .reduce((n, s) => n + s.value.length, 0);
  return same / total;
}

const PAIR_SIMILARITY_THRESHOLD = 0.25;

export function computeTextDiff(
  original: string,
  modified: string,
  options: TextDiffOptions = {},
): TextDiffResult {
  const {
    ignoreTrailingWhitespace = false,
    wordLevel = true,
    granularity = "word",
  } = options;

  const norm = (s: string) =>
    ignoreTrailingWhitespace ? s.replace(/[ \t]+$/g, "") : s;

  const oldLines = original.split("\n");
  const newLines = modified.split("\n");

  const ops = computeLineOps(oldLines.map(norm), newLines.map(norm));

  const inline: InlineDiffLine[] = [];
  const rows: DiffRow[] = [];
  const stats: TextDiffStats = {
    additions: 0,
    deletions: 0,
    modifications: 0,
    unchanged: 0,
  };

  let k = 0;
  while (k < ops.length) {
    const op = ops[k];

    if (op.type === "unchanged") {
      const content = oldLines[op.oldIndex];
      inline.push({
        type: "unchanged",
        content,
        oldLineNumber: op.oldIndex + 1,
        newLineNumber: op.newIndex + 1,
      });
      rows.push({
        type: "unchanged",
        left: { lineNumber: op.oldIndex + 1, content },
        right: { lineNumber: op.newIndex + 1, content: newLines[op.newIndex] },
      });
      stats.unchanged++;
      k++;
      continue;
    }

    // Collect a contiguous change block: every consecutive non-unchanged op,
    // in WHATEVER order the LCS emitted them (added-before-removed is common
    // when a line is edited mid-block — e.g. a phrase inserted into a sentence).
    // Grouping both sides regardless of order lets the pairing below word-diff
    // the lines, so an inserted phrase tints only the phrase, not the whole
    // line. (Collecting only "removed* then added*" left such pairs as
    // unpaired single-sided lines with no intra-line segments.)
    const removed: number[] = [];
    const added: number[] = [];
    while (k < ops.length && ops[k].type !== "unchanged") {
      const cur = ops[k];
      if (cur.type === "removed") removed.push(cur.oldIndex);
      else added.push((cur as { newIndex: number }).newIndex);
      k++;
    }

    const pairCount = Math.min(removed.length, added.length);

    for (let p = 0; p < pairCount; p++) {
      const oldIdx = removed[p];
      const newIdx = added[p];
      const oldText = oldLines[oldIdx];
      const newText = newLines[newIdx];

      let leftSegs: WordSegment[] | undefined;
      let rightSegs: WordSegment[] | undefined;
      if (wordLevel) {
        const wd = computeWordDiff(oldText, newText, granularity);
        const sim = similarity(wd.left, oldText.length);
        if (sim >= PAIR_SIMILARITY_THRESHOLD) {
          leftSegs = wd.left;
          rightSegs = wd.right;
        }
      }

      const rowType: LineChangeType = "modified";
      rows.push({
        type: rowType,
        left: { lineNumber: oldIdx + 1, content: oldText, segments: leftSegs },
        right: {
          lineNumber: newIdx + 1,
          content: newText,
          segments: rightSegs,
        },
      });
      inline.push({
        type: "removed",
        content: oldText,
        oldLineNumber: oldIdx + 1,
        newLineNumber: null,
        segments: leftSegs,
      });
      inline.push({
        type: "added",
        content: newText,
        oldLineNumber: null,
        newLineNumber: newIdx + 1,
        segments: rightSegs,
      });
      stats.modifications++;
    }

    // Leftover removals (no matching addition) — single-sided rows.
    for (let r = pairCount; r < removed.length; r++) {
      const oldIdx = removed[r];
      const content = oldLines[oldIdx];
      rows.push({
        type: "removed",
        left: { lineNumber: oldIdx + 1, content },
        right: { lineNumber: null, content: null },
      });
      inline.push({
        type: "removed",
        content,
        oldLineNumber: oldIdx + 1,
        newLineNumber: null,
      });
      stats.deletions++;
    }

    // Leftover additions.
    for (let a = pairCount; a < added.length; a++) {
      const newIdx = added[a];
      const content = newLines[newIdx];
      rows.push({
        type: "added",
        left: { lineNumber: null, content: null },
        right: { lineNumber: newIdx + 1, content },
      });
      inline.push({
        type: "added",
        content,
        oldLineNumber: null,
        newLineNumber: newIdx + 1,
      });
      stats.additions++;
    }
  }

  const hasChanges =
    stats.additions + stats.deletions + stats.modifications > 0;
  const whitespaceOnly =
    hasChanges && original.replace(/\s+/g, "") === modified.replace(/\s+/g, "");

  return { inline, rows, stats, hasChanges, whitespaceOnly };
}

/** Compact human-readable summary, e.g. "+3 -1 ~2". */
export function summarizeTextDiff(stats: TextDiffStats): string {
  const parts: string[] = [];
  if (stats.additions) parts.push(`+${stats.additions}`);
  if (stats.deletions) parts.push(`-${stats.deletions}`);
  if (stats.modifications) parts.push(`~${stats.modifications}`);
  return parts.join(" ") || "No changes";
}
