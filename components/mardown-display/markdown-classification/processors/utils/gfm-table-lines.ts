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
 * Tables that open with a pipe keep the renderer's older, looser detection
 * (content-splitter-core `detectTableRow`); this module adds the pipe-less form.
 */
import { rowCells, splitRowSegments } from "@/components/rich-editor/core/table-source";

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
