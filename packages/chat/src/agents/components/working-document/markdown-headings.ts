/**
 * Heading-aware slicing for the Notes surface scope.
 *
 * Given a markdown note body and a cursor offset, returns the nearest heading
 * above the cursor and the text under that heading (from the heading line up
 * to — but not including — the next heading of equal-or-higher level, or end
 * of note). Used by `useNotesSurfaceScope` to populate `current_heading` and
 * `current_section_text` on the surface scope.
 *
 * The parser is intentionally tiny — line-by-line, ATX-only (`#`-prefixed
 * headings). Setext headings (`====` under a line) and headings inside fenced
 * code blocks would require a real markdown parser; if real notes start using
 * them and agents need them, switch to `unified`/`remark`.
 */

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/;

function findHeadingAtLineStart(
  content: string,
  lineStartIndex: number,
): { level: number; text: string } | null {
  const lineEnd = content.indexOf("\n", lineStartIndex);
  const line = content.slice(
    lineStartIndex,
    lineEnd === -1 ? content.length : lineEnd,
  );
  const match = HEADING_RE.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

/**
 * Walk backwards from `cursorOffset` line-by-line, returning the first ATX
 * heading we encounter and the text of its section (heading line through the
 * line before the next sibling-or-higher heading, or end of content).
 *
 * Returns `null` for both fields when no heading precedes the cursor.
 */
export function findCurrentHeading(
  content: string,
  cursorOffset: number,
): { heading: string | null; sectionText: string | null } {
  if (!content) return { heading: null, sectionText: null };

  const clamped = Math.max(0, Math.min(cursorOffset, content.length));

  let searchFrom = clamped;
  let headingLineStart = -1;
  let headingLevel = 0;
  let headingText = "";

  while (searchFrom >= 0) {
    const lineStart =
      searchFrom === 0 ? 0 : content.lastIndexOf("\n", searchFrom - 1) + 1;
    const found = findHeadingAtLineStart(content, lineStart);
    if (found) {
      headingLineStart = lineStart;
      headingLevel = found.level;
      headingText = found.text;
      break;
    }
    if (lineStart === 0) break;
    searchFrom = lineStart - 1;
  }

  if (headingLineStart < 0) {
    return { heading: null, sectionText: null };
  }

  // Walk forward from the line AFTER the heading, stop at the next heading of
  // equal or higher level (i.e. smaller-or-equal hash count).
  let cursor = content.indexOf("\n", headingLineStart);
  if (cursor === -1) {
    return { heading: headingText, sectionText: content.slice(headingLineStart) };
  }
  cursor += 1;

  let sectionEnd = content.length;
  while (cursor < content.length) {
    const nextNewline = content.indexOf("\n", cursor);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline;
    const found = findHeadingAtLineStart(content, cursor);
    if (found && found.level <= headingLevel) {
      sectionEnd = cursor;
      break;
    }
    if (nextNewline === -1) break;
    cursor = nextNewline + 1;
  }

  return {
    heading: headingText,
    sectionText: content.slice(headingLineStart, sectionEnd).replace(/\s+$/, ""),
  };
}

/**
 * Whitespace-delimited word count. Treats any run of non-whitespace as one
 * word. Empty / whitespace-only content returns 0. Inexpensive enough to
 * recompute on every emit.
 */
export function countWords(content: string): number {
  if (!content) return 0;
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
