// features/notes/utils/noteStats.ts
//
// Single source of truth for the lightweight, derived metadata we surface
// about a note's content (word count, character count, line count, reading
// time, etc.). Pure + synchronous so callers can wrap it in a single
// `useMemo(() => computeNoteStats(content), [content])` and avoid any
// redundant recalculation — the metadata bar, the editor chrome status bar,
// and the Note Info window all consume this one function.
//
// Keep this dependency-free and side-effect-free. It must stay cheap enough
// to run on every content change without being a render bottleneck.

export interface NoteStats {
  /** Whitespace-delimited word count. */
  words: number;
  /** Total characters, including whitespace (raw `content.length`). */
  characters: number;
  /** Characters excluding all whitespace. */
  charactersNoSpaces: number;
  /** Line count (number of `\n`-separated lines; empty content = 0). */
  lines: number;
  /** Non-empty paragraph blocks (separated by one or more blank lines). */
  paragraphs: number;
  /** Sentence count (rough — split on `.`/`!`/`?`). */
  sentences: number;
  /** Estimated reading time in whole minutes (>=1 when there is content). */
  readingTimeMinutes: number;
}

/** Average adult silent reading speed (words per minute). */
const WORDS_PER_MINUTE = 225;

const EMPTY_STATS: NoteStats = {
  words: 0,
  characters: 0,
  charactersNoSpaces: 0,
  lines: 0,
  paragraphs: 0,
  sentences: 0,
  readingTimeMinutes: 0,
};

/**
 * Compute lightweight content statistics for a note.
 *
 * Single O(n) pass-equivalent: a few linear scans over the string. Cheap
 * enough to call on every keystroke when memoized on `content`.
 */
export function computeNoteStats(
  content: string | null | undefined,
): NoteStats {
  if (!content) return EMPTY_STATS;

  const characters = content.length;
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    // Whitespace-only content: characters still counts the raw length, but
    // there are no words/lines/paragraphs to speak of.
    return { ...EMPTY_STATS, characters };
  }

  const words = trimmed.split(/\s+/).length;
  const charactersNoSpaces = content.replace(/\s/g, "").length;
  const lines = content.split("\n").length;
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0).length;
  const sentences = trimmed
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0).length;
  const readingTimeMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return {
    words,
    characters,
    charactersNoSpaces,
    lines,
    paragraphs,
    sentences,
    readingTimeMinutes,
  };
}

/** Compact, locale-aware integer formatting (e.g. `1,234`). */
export function formatStatNumber(n: number): string {
  return n.toLocaleString();
}
