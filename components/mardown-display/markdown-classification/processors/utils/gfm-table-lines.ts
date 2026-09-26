/**
 * Where a GFM table starts and how far it runs — the ONE rule the chat block
 * splitter (V2, content-splitter-core) and the live stream accumulator share
 * (verify-RC-B4 R5-3: a table written without edge pipes showed as plain text
 * in chat while Studio and every other preset drew it).
 *
 * GFM: a table starts at a header line holding an unescaped pipe whose NEXT
 * line is a delimiter row (`--- | :-:`, edge pipes optional) with the same
 * number of cells. It runs until a blank line or a line that starts another
 * block. Cells are split by THE one splitter (rich-editor/core/table-source),
 * so an escaped `\|` never counts as a boundary here either.
 *
 * Every table READER in the app goes through here (guard: `pnpm check:table-readers`):
 * `findTableStart`, `continuesTable`, `isGfmDelimiterRow`, `rowCells`, `unescapeCellPipes`.
 */
import { rowCells, splitRowSegments } from "@/components/rich-editor/core/table-source";

/** THE row splitter's cells (table-source) — re-exported so a table reader needs this one module. */
export { rowCells, splitRowSegments };
export { unescapeCellPipes } from "@/components/markdown-core/syntax/gfm-cell-pipes";

/** A line GFM reads as the start of another block (list item, quote, heading, fence, rule). */
const BLOCK_START = /^(?:[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|>|#{1,6}(?:\s|$)|```|~~~|(?:-\s*){3,}$|(?:\*\s*){3,}$|(?:_\s*){3,}$)/;

const DELIMITER_CELL = /^:?-+:?$/;

/** A GFM delimiter row: every cell `---`, `:--`, `--:` or `:-:`, with at least one pipe. */
export function isGfmDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = rowCells(trimmed);
  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell));
}

/** True when `header` + `delimiter` open a table whose header has NO leading pipe. */
export function startsPipelessTable(header: string, delimiter: string | undefined): boolean {
  const head = header.trim();
  if (!head || head.startsWith("|") || BLOCK_START.test(head)) return false;
  if (splitRowSegments(head).length < 2) return false;
  if (delimiter === undefined || !isGfmDelimiterRow(delimiter)) return false;
  return rowCells(head).length === rowCells(delimiter.trim()).length;
}

/**
 * A line that continues an open table: a pipe-led row (the older rule), or a
 * pipe-less line holding an unescaped pipe that does not start another block.
 */
export function continuesTable(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("|")) return trimmed.includes("|", 1);
  return splitRowSegments(trimmed).length > 1 && !BLOCK_START.test(trimmed);
}

/** A pipe-led row that opens (or continues) a table: `|` first, and another `|` after it. */
export function isPipeLedRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("|", 1);
}

/**
 * Index of the first line at or after `from` that opens a table — a pipe-led
 * row, or a pipe-less GFM header over its delimiter row; -1 when none.
 */
export function findTableStart(lines: readonly string[], from = 0): number {
  for (let i = Math.max(0, from); i < lines.length; i += 1) if (opensTable(lines, i)) return i;
  return -1;
}

/** Line `index` opens a table: a pipe-led row, or a pipe-less GFM header over its delimiter row. */
export function opensTable(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  return isPipeLedRow(line) || startsPipelessTable(line, lines[index + 1]);
}

/** A WHOLE table header at `index`: a table opens here AND its next line is a GFM delimiter row. */
export function tableStartsAt(lines: readonly string[], index: number): boolean {
  return opensTable(lines, index) && isGfmDelimiterRow(lines[index + 1] ?? "");
}

/** Index just past the table whose header is at `start` (header, delimiter, then continuation rows). */
export function findTableEnd(lines: readonly string[], start: number): number {
  let end = Math.min(lines.length, start + 2);
  while (end < lines.length && continuesTable(lines[end] ?? "")) end += 1;
  return end;
}

// ── Streaming: a table still arriving ───────────────────────────────────────

/** A line that starts like a pipe-led row — even a lone `|` still growing. */
export function startsLikeTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

/** A delimiter row still arriving: only pipes, colons, dashes and spaces, with a dash so far. */
export function isGrowingDelimiterRow(line: string): boolean {
  return /^[\s|:-]*-[\s|:-]*$/.test(line);
}

/**
 * The trailing lines of a streaming text that belong to a table being written
 * (pipe-led rows, even partial; pipe-less rows once a delimiter follows the
 * header): the start index, or `end` when the tail is not a table. A lone
 * pipe-less line is never claimed — it may be prose.
 */
export function trailingTableStart(lines: readonly string[], end = lines.length): number {
  const isTableLine = (line: string) => startsLikeTableRow(line) || continuesTable(line);
  let start = end;
  while (start > 0 && isTableLine(lines[start - 1] ?? "")) start -= 1;
  // A pipe-less table's delimiter row still arriving (`---`, no pipe yet).
  if (start === end && end > 1 && isGrowingDelimiterRow(lines[end - 1] ?? "") && continuesTable(lines[end - 2] ?? "")) {
    start = end - 1;
    while (start > 0 && isTableLine(lines[start - 1] ?? "")) start -= 1;
  }
  // The table starts at the first line that can head one: a pipe-led row, or a
  // pipe-less header whose next line is (becoming) its delimiter row. Prose with
  // a pipe above the table is not part of it.
  for (let head = start; head < end; head += 1) {
    if (startsLikeTableRow(lines[head] ?? "")) return head;
    if (end - head > 1 && isGrowingDelimiterRow(lines[head + 1] ?? "")) return head;
  }
  return end;
}
