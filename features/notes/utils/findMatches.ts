// features/notes/utils/findMatches.ts
// Pure match engine for Find & Replace — no React dependencies, fully testable.

export interface FindMatch {
  start: number;
  end: number;
}

export interface FindOptions {
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
}

/**
 * Build a RegExp from a query string + options.
 * Returns null if the query is empty or an invalid regex.
 */
function buildPattern(query: string, options: FindOptions): RegExp | null {
  if (!query) return null;

  let pattern: string;
  if (options.useRegex) {
    try {
      // Validate the regex
      new RegExp(query);
      pattern = query;
    } catch {
      return null; // Invalid regex — caller should show error state
    }
  } else {
    // Escape regex special characters for literal matching
    pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const flags = options.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Find all matches of a query in content.
 * Returns an array of { start, end } positions sorted by start.
 */
export function computeMatches(
  content: string,
  query: string,
  options: FindOptions,
): FindMatch[] {
  const regex = buildPattern(query, options);
  if (!regex) return [];

  const matches: FindMatch[] = [];
  let match: RegExpExecArray | null;

  // Safety: limit iterations to prevent catastrophic backtracking on pathological regex
  let limit = 100_000;
  while ((match = regex.exec(content)) !== null && limit-- > 0) {
    if (match[0].length === 0) {
      // Zero-length match — advance to avoid infinite loop
      regex.lastIndex++;
      continue;
    }
    matches.push({ start: match.index, end: match.index + match[0].length });
  }

  return matches;
}

// ── Path filtering for global search ────────────────────────────────────────
//
// VS Code's "files to include / exclude" fields take comma-separated glob
// patterns. Notes don't have real paths — we treat each note as living at
// `<folder>/<label>` (lowercased) and let the user write patterns against
// that synthetic path. We support `*` as the only meta-character because
// note paths are short and shallow; full globstar (`**`) would just be
// noise.

/** Convert a single user pattern to a regex matching the full synthetic path. */
function patternToRegex(rawPattern: string): RegExp | null {
  const pattern = rawPattern.trim();
  if (!pattern) return null;
  // Escape regex meta, then turn `*` (which we just escaped to `\*`) into `.*`.
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  try {
    return new RegExp(escaped, "i");
  } catch {
    return null;
  }
}

/** Parse the user's comma-separated pattern field into compiled regexes. */
export function parsePathPatterns(value: string): RegExp[] {
  if (!value) return [];
  return value
    .split(",")
    .map((p) => patternToRegex(p))
    .filter((r): r is RegExp => r !== null);
}

/**
 * VS Code semantics:
 * - When `includes` is non-empty, a note must match at least one include.
 * - When `excludes` is non-empty, a note matching any exclude is dropped.
 * - An empty include list means "include everything" (not "include nothing").
 */
export function matchesPathFilter(
  syntheticPath: string,
  includes: RegExp[],
  excludes: RegExp[],
): boolean {
  if (includes.length > 0 && !includes.some((r) => r.test(syntheticPath))) {
    return false;
  }
  if (excludes.length > 0 && excludes.some((r) => r.test(syntheticPath))) {
    return false;
  }
  return true;
}

// ── Global search ───────────────────────────────────────────────────────────

export interface GlobalSearchNote {
  id: string;
  label: string;
  folder: string;
  content: string;
}

export interface GlobalMatchHit {
  /** 0-based index of this match within its parent note's match list. */
  indexInNote: number;
  /** Absolute character offset of the match start in the note's content. */
  start: number;
  end: number;
  /** 0-based line number of `start` in the note's content. */
  line: number;
  /** Full line text containing the match (for the result row preview). */
  lineText: string;
  /** `start` translated to a column within `lineText`. */
  columnStart: number;
  /** `end` translated to a column within `lineText` (clamped at line end). */
  columnEnd: number;
}

export interface GlobalSearchNoteResult {
  noteId: string;
  label: string;
  folder: string;
  hits: GlobalMatchHit[];
}

export interface GlobalSearchResults {
  /** Notes that had at least one match, sorted by folder then label. */
  results: GlobalSearchNoteResult[];
  /** Sum of all hits across all notes. */
  totalMatches: number;
  /** Number of notes containing at least one hit. */
  matchedNotes: number;
  /** Number of notes the query was actually run against (after path filter). */
  searchedNotes: number;
}

/**
 * Compute line number + line text for a given absolute offset. O(n) in
 * `offset`, but cheap enough for typical note sizes and called at most
 * `matchCount` times per note.
 */
function locateLine(content: string, offset: number): {
  line: number;
  lineStart: number;
  lineEnd: number;
  lineText: string;
} {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      lineStart = i + 1;
    }
  }
  let lineEnd = content.indexOf("\n", lineStart);
  if (lineEnd === -1) lineEnd = content.length;
  return {
    line,
    lineStart,
    lineEnd,
    lineText: content.slice(lineStart, lineEnd),
  };
}

/** Truncate result row preview lines so the panel doesn't blow up on long lines. */
const MAX_PREVIEW_LINE_LENGTH = 400;

export function computeGlobalMatches(
  notes: readonly GlobalSearchNote[],
  query: string,
  options: FindOptions,
  includes: RegExp[],
  excludes: RegExp[],
): GlobalSearchResults {
  const empty: GlobalSearchResults = {
    results: [],
    totalMatches: 0,
    matchedNotes: 0,
    searchedNotes: 0,
  };
  if (!query) return empty;

  const filtered = notes.filter((n) =>
    matchesPathFilter(
      `${n.folder}/${n.label}`.toLowerCase(),
      includes,
      excludes,
    ),
  );

  const results: GlobalSearchNoteResult[] = [];
  let totalMatches = 0;

  for (const note of filtered) {
    const matches = computeMatches(note.content, query, options);
    if (matches.length === 0) continue;

    const hits: GlobalMatchHit[] = matches.map((m, idx) => {
      const { line, lineStart, lineEnd, lineText } = locateLine(
        note.content,
        m.start,
      );
      const columnStart = m.start - lineStart;
      const columnEnd = Math.min(m.end - lineStart, lineEnd - lineStart);
      const safeLine =
        lineText.length > MAX_PREVIEW_LINE_LENGTH
          ? lineText.slice(0, MAX_PREVIEW_LINE_LENGTH) + "…"
          : lineText;
      return {
        indexInNote: idx,
        start: m.start,
        end: m.end,
        line,
        lineText: safeLine,
        columnStart,
        columnEnd: Math.min(columnEnd, safeLine.length),
      };
    });

    results.push({
      noteId: note.id,
      label: note.label,
      folder: note.folder,
      hits,
    });
    totalMatches += hits.length;
  }

  results.sort((a, b) => {
    const f = a.folder.localeCompare(b.folder, undefined, {
      sensitivity: "base",
    });
    if (f !== 0) return f;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });

  return {
    results,
    totalMatches,
    matchedNotes: results.length,
    searchedNotes: filtered.length,
  };
}

/**
 * Replace a single match at `targetIndex`, or all matches if `targetIndex` is undefined.
 * Returns the new content string.
 */
export function applyReplace(
  content: string,
  matches: FindMatch[],
  replaceText: string,
  targetIndex?: number,
): string {
  if (matches.length === 0) return content;

  // Replace specific match
  if (targetIndex !== undefined) {
    const m = matches[targetIndex];
    if (!m) return content;
    return content.slice(0, m.start) + replaceText + content.slice(m.end);
  }

  // Replace all — iterate from end to preserve earlier positions
  let result = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    result = result.slice(0, m.start) + replaceText + result.slice(m.end);
  }
  return result;
}
