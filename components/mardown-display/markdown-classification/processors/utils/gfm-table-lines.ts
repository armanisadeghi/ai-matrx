/**
 * The GFM table rule for matrx-frontend's readers — THE rule itself lives in
 * `@ai-matrx/content-ir/source` (source/gfm-table.ts: one splitter, one cell-pipe
 * rule, where a table starts and runs), shared with @ai-matrx/print, the chat
 * package and — by vectors — the Python block detector. This module re-exports
 * it for the app's readers and adds the STREAMING helpers only the live
 * renderer needs (a table still arriving). verify-RC-B4 R5/R6.
 *
 * Every table READER in the app goes through here (guard: `pnpm check:table-readers`).
 */
import { continuesTable } from "@ai-matrx/content-ir/source";

export {
  continuesTable,
  findTableEnd,
  findTableStart,
  isGfmDelimiterRow,
  isPipeLedRow,
  lineIndent,
  opensTable,
  rowCells,
  splitRowSegments,
  startsHtmlBlock,
  startsPipelessTable,
  tableContainerIndent,
  tableStartsAt,
  unescapeCellPipes,
} from "@ai-matrx/content-ir/source";

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
  // No header in hand to measure a container from: indentation is not judged here
  // (a list item's table rows stay rows); HTML and other block starts still end it.
  const isTableLine = (line: string) => startsLikeTableRow(line) || continuesTable(line.trimStart());
  let start = end;
  while (start > 0 && isTableLine(lines[start - 1] ?? "")) start -= 1;
  // A pipe-less table's delimiter row still arriving (`---`, no pipe yet).
  if (start === end && end > 1 && isGrowingDelimiterRow(lines[end - 1] ?? "") && continuesTable((lines[end - 2] ?? "").trimStart())) {
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
