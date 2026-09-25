// ─────────────────────────────────────────────────────────────────────────
// BLOCK-LEVEL stream holdback for nested content (standard level).
//
// The core healer (components/markdown-core/stream-heal.ts, run by
// MarkdownCore inside a live stream) closes half-arrived INLINE syntax —
// `**b`, `` `code ``, links. It cannot know that a run of `| a | b |` lines is
// a table whose delimiter row has not arrived yet, or that `$$\int_0^1` is a
// display formula still being typed: parsed as-is, those print as raw pipes
// and raw TeX for a few hundred milliseconds (verify-RC-B2, 2026-09-25). A
// nested ```markdown document streams exactly like a top-level answer, so its
// tail is held back here before it is split and rendered:
//
//   - a trailing partial tag (`<inf`) or one/two-backtick line  → dropped
//   - trailing pipe rows with no delimiter row yet              → held back
//   - a partial last table row (no closing `|` yet)             → held back
//   - an unclosed `$$ …` / `\[ …` / `\( …` formula              → held back
//   - an unclosed single-`$` formula carrying a TeX signal       → held back
//
// Only the TAIL of a live stream is touched; finished text is never passed
// here. Fenced code is left alone (its content is literal).
// ─────────────────────────────────────────────────────────────────────────

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const TEX_SIGNAL = /\\[A-Za-z]+|[\\^_{}]/;

/** Offset where an open fenced code block starts, or -1 when none is open. */
function openFenceStart(source: string): number {
  let open: { marker: string; at: number } | null = null;
  let offset = 0;
  for (const line of source.split("\n")) {
    const fence = FENCE_LINE.exec(line);
    if (fence) {
      if (!open) open = { marker: fence[1], at: offset };
      else if (
        fence[1][0] === open.marker[0] &&
        fence[1].length >= open.marker.length &&
        line.trim() === fence[1]
      )
        open = null;
    }
    offset += line.length + 1;
  }
  return open ? open.at : -1;
}

function holdBackTable(text: string): string {
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  let start = end;
  while (start > 0 && TABLE_ROW.test(lines[start - 1])) start--;
  if (start === end) return text;
  const rows = lines.slice(start, end);
  const hasDelimiter = rows.some((row) => TABLE_DELIMITER.test(row));
  if (!hasDelimiter) {
    // Header (and maybe more) without the delimiter row: not a table yet.
    return lines.slice(0, start).join("\n");
  }
  const last = rows[rows.length - 1].trimEnd();
  if (end === lines.length && !last.endsWith("|")) {
    // The last row is still arriving.
    return lines.slice(0, end - 1).join("\n");
  }
  return text;
}

function holdBackMath(text: string): string {
  // Display `$$`: an odd count means the last one is still open.
  const displays = [...text.matchAll(/\$\$/g)];
  if (displays.length % 2 === 1) {
    return text.slice(0, displays[displays.length - 1].index);
  }
  for (const [open, close] of [
    ["\\[", "\\]"],
    ["\\(", "\\)"],
  ] as const) {
    const at = text.lastIndexOf(open);
    if (at !== -1 && text.indexOf(close, at + open.length) === -1) {
      return text.slice(0, at);
    }
  }
  // Single `$` on the last line: an unmatched opener followed by TeX.
  const lineStart = text.lastIndexOf("\n") + 1;
  const lastLine = text.slice(lineStart).replace(/\$\$/g, "  ");
  const dollars = [...lastLine.matchAll(/(?<!\\)\$/g)];
  if (dollars.length % 2 === 1) {
    const at = dollars[dollars.length - 1].index;
    if (TEX_SIGNAL.test(lastLine.slice(at + 1))) {
      return text.slice(0, lineStart + at);
    }
  }
  return text;
}

/** Heal the tail of a still-streaming nested source before it is split. */
export function healStreamingTail(source: string): string {
  const lastNewline = source.lastIndexOf("\n");
  const lastLine = source.slice(lastNewline + 1);
  if (/^\s*`{1,2}\s*$/.test(lastLine)) return source.slice(0, lastNewline + 1);
  const partialTag = /<\/?[A-Za-z][\w:-]*(?:\s[^<>]*)?$/.exec(lastLine);
  if (partialTag) {
    return source.slice(0, lastNewline + 1 + partialTag.index);
  }
  // Inside an open fenced code block the tail is literal code: the splitter
  // renders it as a streaming code block, nothing to hold back.
  if (openFenceStart(source) !== -1) return source;
  return holdBackMath(holdBackTable(source));
}
