// features/notes/utils/diffAnalysis.ts
// Pure diff analysis utility for comparing two text versions.
// No external dependencies — uses line-based LCS algorithm.

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiffSegment {
  type: "added" | "removed" | "unchanged";
  content: string;
}

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

// ── Normalization helpers ────────────────────────────────────────────────────

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function removeEmptyLines(s: string): string {
  return s
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

// ── LCS-based line diff ─────────────────────────────────────────────────────

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

// LCS is O(m·n) in time AND memory. Unbounded, a large pasted document
// (thousands of lines on both sides) allocates a multi-million-cell matrix —
// enough to hang the main thread for seconds or OOM the tab (2026-07 /notes
// freeze class: a single conflict on a big paste "nearly crashed" the tab).
// Guard: trim the common prefix/suffix first (typical edits touch one
// region, collapsing the matrix to the changed window), then hard-cap the
// remaining product and fall back to a coarse removed/added pair.
const LCS_MAX_CELLS = 250_000;

function buildDiffSegments(local: string[], remote: string[]): DiffSegment[] {
  const segments: DiffSegment[] = [];

  // Trim common prefix/suffix — O(n), shrinks the LCS window dramatically.
  let prefix = 0;
  const maxPrefix = Math.min(local.length, remote.length);
  while (prefix < maxPrefix && local[prefix] === remote[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    local[local.length - 1 - suffix] === remote[remote.length - 1 - suffix]
  ) {
    suffix++;
  }

  const localMid = local.slice(prefix, local.length - suffix);
  const remoteMid = remote.slice(prefix, remote.length - suffix);

  if (prefix > 0) {
    segments.push({
      type: "unchanged",
      content: local.slice(0, prefix).join("\n"),
    });
  }

  if (localMid.length * remoteMid.length > LCS_MAX_CELLS) {
    // Too large for exact LCS — coarse fallback: one removed + one added
    // block. Counts and data-loss flags stay correct; only intra-region
    // line alignment is lost.
    if (localMid.length > 0) {
      segments.push({ type: "removed", content: localMid.join("\n") });
    }
    if (remoteMid.length > 0) {
      segments.push({ type: "added", content: remoteMid.join("\n") });
    }
  } else if (localMid.length > 0 || remoteMid.length > 0) {
    for (const seg of lcsSegments(localMid, remoteMid)) {
      const last = segments[segments.length - 1];
      if (last && last.type === seg.type) {
        last.content += "\n" + seg.content;
      } else {
        segments.push(seg);
      }
    }
  }

  if (suffix > 0) {
    const tail = local.slice(local.length - suffix).join("\n");
    const last = segments[segments.length - 1];
    if (last && last.type === "unchanged") {
      last.content += "\n" + tail;
    } else {
      segments.push({ type: "unchanged", content: tail });
    }
  }

  return segments;
}

function lcsSegments(local: string[], remote: string[]): DiffSegment[] {
  const dp = lcsMatrix(local, remote);
  const segments: DiffSegment[] = [];
  let i = local.length;
  let j = remote.length;

  // Backtrack through LCS matrix
  const ops: Array<{ type: "unchanged" | "removed" | "added"; line: string }> =
    [];

  while (i > 0 && j > 0) {
    if (local[i - 1] === remote[j - 1]) {
      ops.push({ type: "unchanged", line: local[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "removed", line: local[i - 1] });
      i--;
    } else {
      ops.push({ type: "added", line: remote[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ type: "removed", line: local[i - 1] });
    i--;
  }
  while (j > 0) {
    ops.push({ type: "added", line: remote[j - 1] });
    j--;
  }

  ops.reverse();

  // Merge consecutive same-type ops into segments
  for (const op of ops) {
    const last = segments[segments.length - 1];
    if (last && last.type === op.type) {
      last.content += "\n" + op.line;
    } else {
      segments.push({ type: op.type, content: op.line });
    }
  }

  return segments;
}

// ── Main analysis function ──────────────────────────────────────────────────

export function analyzeDiff(local: string, remote: string): DiffAnalysis {
  // Quick equality check
  if (local === remote) {
    return {
      hasChanges: false,
      hasChangesExcludingWhitespace: false,
      hasChangesExcludingEmptyLines: false,
      hasChangesExcludingTrim: false,
      charsChanged: 0,
      linesChanged: 0,
      remoteHasContentLocalDoesNot: false,
      localHasContentRemoteDoesNot: false,
      segments: [{ type: "unchanged", content: local }],
      summary: "No differences",
    };
  }

  // Cascading checks
  const hasChanges = true;
  const hasChangesExcludingWhitespace =
    normalizeWhitespace(local) !== normalizeWhitespace(remote);
  const hasChangesExcludingEmptyLines =
    removeEmptyLines(local) !== removeEmptyLines(remote);
  const hasChangesExcludingTrim = local.trim() !== remote.trim();

  // Character diff count (simple)
  const charsChanged = Math.abs(local.length - remote.length) +
    (() => {
      const minLen = Math.min(local.length, remote.length);
      let diffs = 0;
      for (let i = 0; i < minLen; i++) {
        if (local[i] !== remote[i]) diffs++;
      }
      return diffs;
    })();

  // Line-based diff
  const localLines = local.split("\n");
  const remoteLines = remote.split("\n");
  const segments = buildDiffSegments(localLines, remoteLines);

  // Count changed lines
  let addedLines = 0;
  let removedLines = 0;
  for (const seg of segments) {
    const lineCount = seg.content.split("\n").length;
    if (seg.type === "added") addedLines += lineCount;
    if (seg.type === "removed") removedLines += lineCount;
  }
  const linesChanged = addedLines + removedLines;

  // Data loss indicators
  const remoteHasContentLocalDoesNot = addedLines > 0;
  const localHasContentRemoteDoesNot = removedLines > 0;

  // Summary
  const parts: string[] = [];
  if (linesChanged > 0) parts.push(`${linesChanged} line${linesChanged !== 1 ? "s" : ""} changed`);
  if (charsChanged > 0) parts.push(`${charsChanged} char${charsChanged !== 1 ? "s" : ""} different`);
  if (remoteHasContentLocalDoesNot) parts.push("remote has content you're missing");
  if (localHasContentRemoteDoesNot) parts.push("you have content remote doesn't");
  if (!hasChangesExcludingWhitespace) parts.push("only whitespace differences");
  const summary = parts.join(" · ") || "Minor differences";

  return {
    hasChanges,
    hasChangesExcludingWhitespace,
    hasChangesExcludingEmptyLines,
    hasChangesExcludingTrim,
    charsChanged,
    linesChanged,
    remoteHasContentLocalDoesNot,
    localHasContentRemoteDoesNot,
    segments,
    summary,
  };
}
