// components/diff/text/engine/types.ts
//
// Canonical text/markdown diff types. This engine is the single source of
// truth for plain-text and markdown line diffs across the app (notes,
// messages, version history, clipboard compare, etc.). It is framework-
// agnostic and has zero React / Redux / DOM dependencies.
//
// It produces BOTH representations from one computation:
//   - `inline`  : a single sequential list of lines (unified view)
//   - `rows`    : aligned left/right pairs (side-by-side / split view)
// plus optional word/char-level segments for changed line pairs, which the
// older hand-rolled diffs (generateDiff.ts, diffAnalysis.ts) never produced.

export type LineChangeType = "added" | "removed" | "unchanged" | "modified";

/** A run of intra-line text classified for word/char-level highlighting. */
export interface WordSegment {
  type: "added" | "removed" | "unchanged";
  value: string;
}

/** One side (old or new) of an aligned diff row. Absent when the row only
 * exists on the other side (pure add / pure removal). */
export interface DiffCell {
  /** 1-based line number on this side, or null for a placeholder/empty cell. */
  lineNumber: number | null;
  /** Full line text ("" for blank lines, null for an absent cell). */
  content: string | null;
  /** Word/char-level segments, present only for `modified` row pairs. */
  segments?: WordSegment[];
}

/** A row in the side-by-side (split) representation. */
export interface DiffRow {
  type: LineChangeType;
  left: DiffCell;
  right: DiffCell;
}

/** A line in the inline (unified) representation. */
export interface InlineDiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  /** Old-side line number (present for removed/unchanged). */
  oldLineNumber: number | null;
  /** New-side line number (present for added/unchanged). */
  newLineNumber: number | null;
  /** Word/char-level segments for the changed portion, when this line is
   * part of a modified pair (used by the inline renderer to highlight). */
  segments?: WordSegment[];
}

export interface TextDiffStats {
  /** Lines present only on the new side. */
  additions: number;
  /** Lines present only on the old side. */
  deletions: number;
  /** Changed line pairs (a removal aligned with an addition). */
  modifications: number;
  unchanged: number;
}

export interface TextDiffResult {
  inline: InlineDiffLine[];
  rows: DiffRow[];
  stats: TextDiffStats;
  hasChanges: boolean;
  /** True when the only differences are whitespace. */
  whitespaceOnly: boolean;
}

export type WordGranularity = "word" | "character";

export interface TextDiffOptions {
  /** Treat trailing-whitespace-only line differences as unchanged. */
  ignoreTrailingWhitespace?: boolean;
  /** Compute intra-line word/char segments for changed pairs. Default true. */
  wordLevel?: boolean;
  /** Granularity for intra-line diffing. Default "word". */
  granularity?: WordGranularity;
}
