// features/notes/utils/diffAnalysis.ts
// The notes conflict reading of two versions of a note: the local copy against
// the remote one. The line alignment, counts, whitespace flags and content-loss
// detection are `@ai-matrx/diff`'s `analyzeTextChange`; this file binds the
// notes cap and names the two sides (local = original, remote = modified) and
// writes the one-line summary the conflict window and version history show.

import { analyzeTextChange, type TextChangeSegment } from "@ai-matrx/diff/text";

export type DiffSegment = TextChangeSegment;

export interface DiffAnalysis {
  /** Any difference at all between local and remote */
  hasChanges: boolean;
  /** Changes exist after normalizing all whitespace to single spaces */
  hasChangesExcludingWhitespace: boolean;
  /** Changes exist after removing all blank lines */
  hasChangesExcludingEmptyLines: boolean;
  /** Changes exist after trimming leading/trailing whitespace from each version */
  hasChangesExcludingTrim: boolean;
  /** Total characters that differ */
  charsChanged: number;
  /** Total lines that differ (added + removed) */
  linesChanged: number;
  /** Remote has content that local doesn't — data loss risk if we save local */
  remoteHasContentLocalDoesNot: boolean;
  /** Local has content that remote doesn't */
  localHasContentRemoteDoesNot: boolean;
  /** Renderable diff segments for the UI */
  segments: DiffSegment[];
  /** Human-readable summary */
  summary: string;
}

// analyzeDiff runs during render (memoized per conflict), so the notes cap is
// far below the package default: above 250,000 LCS cells in the changed middle
// the middle is read as one removed and one added block (2026-07 /notes freeze
// class — a conflict on a big paste nearly crashed the tab).
const NOTES_LCS_MAX_CELLS = 250_000;

export function analyzeDiff(local: string, remote: string): DiffAnalysis {
  const a = analyzeTextChange(local, remote, { maxLcsCells: NOTES_LCS_MAX_CELLS });
  if (!a.hasChanges) {
    return {
      hasChanges: false,
      hasChangesExcludingWhitespace: false,
      hasChangesExcludingEmptyLines: false,
      hasChangesExcludingTrim: false,
      charsChanged: 0,
      linesChanged: 0,
      remoteHasContentLocalDoesNot: false,
      localHasContentRemoteDoesNot: false,
      segments: a.segments,
      summary: "No differences",
    };
  }

  const remoteHasContentLocalDoesNot = a.modifiedHasContentOriginalLacks;
  const localHasContentRemoteDoesNot = a.originalHasContentModifiedLacks;
  const { linesChanged, charsChanged } = a;

  const parts: string[] = [];
  if (linesChanged > 0) parts.push(`${linesChanged} line${linesChanged !== 1 ? "s" : ""} changed`);
  if (charsChanged > 0) parts.push(`${charsChanged} char${charsChanged !== 1 ? "s" : ""} different`);
  if (remoteHasContentLocalDoesNot) parts.push("remote has content you're missing");
  if (localHasContentRemoteDoesNot) parts.push("you have content remote doesn't");
  if (!a.hasChangesExcludingWhitespace) parts.push("only whitespace differences");
  const summary = parts.join(" · ") || "Minor differences";

  return {
    hasChanges: true,
    hasChangesExcludingWhitespace: a.hasChangesExcludingWhitespace,
    hasChangesExcludingEmptyLines: a.hasChangesExcludingEmptyLines,
    hasChangesExcludingTrim: a.hasChangesExcludingTrim,
    charsChanged,
    linesChanged,
    remoteHasContentLocalDoesNot,
    localHasContentRemoteDoesNot,
    segments: a.segments,
    summary,
  };
}
