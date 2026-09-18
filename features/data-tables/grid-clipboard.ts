/**
 * Clipboard model for the user-data-table grid.
 *
 * WHAT A SPREADSHEET PUTS ON THE CLIPBOARD. Excel, Google Sheets and Numbers
 * all copy a range as TAB-separated rows, one line per row, and quote any cell
 * whose text contains a tab, a line break or a double quote (doubling the
 * quotes inside). That is also what they ACCEPT on paste. Speaking exactly
 * that dialect is what makes "copy three columns in Sheets, click a cell here,
 * Cmd-V" land as a block instead of as one cell holding a wall of text — and
 * what makes the reverse trip (copy here, paste into Sheets) split into cells.
 *
 * WHY THE PLAN IS A PURE FUNCTION. Pasting a block is a write to many cells at
 * once, and "which cells" is the part that goes wrong: off by one column, the
 * anchor row filtered out, a block wider than the grid. Computing the landing
 * cells here, with no React and no DOM, is what lets that mapping be tested
 * cell by cell — and lets the caller decide separately what to do with the
 * rows that did not fit.
 *
 * Addresses are (rowId, fieldName), like the rest of the grid — never indices.
 */

import type { CellAddress } from "./grid-selection";

/** One cell as text for the clipboard. Objects go out as JSON. */
export function cellClipboardText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Quote a cell the way Excel does, only when it has to be. */
function tsvCell(text: string): string {
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A rectangular block of cells as spreadsheet TSV. */
export function gridToTsv(block: readonly (readonly unknown[])[]): string {
  return block
    .map((row) => row.map((cell) => tsvCell(cellClipboardText(cell))).join("\t"))
    .join("\n");
}

/**
 * Parse clipboard text as a spreadsheet block.
 *
 * Handles the Excel quoting dialect (a quoted cell may span lines and carries
 * `""` for a literal quote), both `\n` and `\r\n` line endings, and the single
 * trailing line break Excel and Sheets append to every copy — without that
 * strip, every paste would be one empty row taller than what was copied.
 *
 * Plain text with no tabs and no quotes still parses: one column, one row per
 * line, which is exactly what Sheets does with the same text. A single value
 * with no line break is a 1×1 block.
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    // A quote opens a quoted cell only at the START of a cell.
    if (cell === "" && ch === '"') {
      // Quoted cell: read to the closing quote, honouring doubled quotes.
      let j = i + 1;
      let out = "";
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        out += c;
        j += 1;
      }
      if (closed && (j >= n || text[j] === "\t" || text[j] === "\n" || text[j] === "\r")) {
        cell = out;
        i = j;
        // Fall through to the delimiter handling below with `cell` complete.
        if (i >= n) break;
        const d = text[i];
        if (d === "\t") {
          row.push(cell);
          cell = "";
          i += 1;
          continue;
        }
        // line break
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i += d === "\r" && text[i + 1] === "\n" ? 2 : 1;
        continue;
      }
      // Not a well-formed quoted cell (a value that merely starts with a
      // quote). Treat the quote literally and keep going.
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === "\t") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  // Flush the last cell — unless the text ended on a line break, in which
  // case that break was the trailing one every spreadsheet appends.
  const endedOnBreak = n > 0 && (text[n - 1] === "\n" || text[n - 1] === "\r");
  if (!endedOnBreak) {
    row.push(cell);
    rows.push(row);
  } else if (row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.length === 0 ? [[""]] : rows;
}

/** One landing cell of a paste, with the raw text that goes into it. */
export type PasteCell = CellAddress & { raw: string };

export type PastePlan = {
  /** Cells inside the grid, in reading order (row by row). */
  cells: PasteCell[];
  /**
   * Block rows below the last grid row, trimmed to the columns that fit from
   * the anchor column rightward. The caller decides whether these become new
   * rows — the plan only reports them so nothing is dropped silently.
   */
  overflowRows: string[][];
  /** How many block columns fell off the right edge (per row, at most). */
  clippedColumns: number;
  /** The columns (field names) the block spans, anchor first. */
  fieldNames: string[];
};

/**
 * Where does `block` land when pasted with its top-left cell at `anchor`?
 *
 * Rows extend downward from the anchor row and columns rightward from the
 * anchor column, in the GRID's current order (so a hidden or re-ordered column
 * is honoured — you paste into what you see). A block wider than the remaining
 * columns is clipped on the right; a block taller than the remaining rows is
 * reported as `overflowRows` rather than lost.
 *
 * Returns null when the anchor is not on the grid — the row was filtered out
 * or the column hidden since the selection was made. Writing "somewhere near"
 * is worse than refusing.
 */
export function planPaste(
  anchor: CellAddress,
  block: readonly (readonly string[])[],
  rowIds: readonly string[],
  fieldNames: readonly string[],
): PastePlan | null {
  const r0 = rowIds.indexOf(anchor.rowId);
  const c0 = fieldNames.indexOf(anchor.fieldName);
  if (r0 === -1 || c0 === -1) return null;

  const width = block.reduce((w, row) => Math.max(w, row.length), 0);
  const colsAvailable = fieldNames.length - c0;
  const colsUsed = Math.min(width, colsAvailable);
  const targetFields = fieldNames.slice(c0, c0 + colsUsed);

  const cells: PasteCell[] = [];
  const overflowRows: string[][] = [];

  block.forEach((blockRow, dr) => {
    const rowId = rowIds[r0 + dr];
    if (rowId === undefined) {
      overflowRows.push(targetFields.map((_, dc) => blockRow[dc] ?? ""));
      return;
    }
    targetFields.forEach((fieldName, dc) => {
      // A ragged block (some rows shorter) leaves the cells it does not
      // reach alone rather than blanking them — matches Sheets.
      if (dc >= blockRow.length) return;
      cells.push({ rowId, fieldName, raw: blockRow[dc] });
    });
  });

  return {
    cells,
    overflowRows,
    clippedColumns: Math.max(0, width - colsAvailable),
    fieldNames: targetFields,
  };
}

/** True when the parsed block is a single value — the common Cmd-V case. */
export function isSingleCell(block: readonly (readonly string[])[]): boolean {
  return block.length === 1 && block[0].length === 1;
}

/**
 * Would writing `next` over `prior` change what is stored? Objects compare by
 * their JSON, the same test the inline editor uses to skip a no-op write.
 */
export function storedValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
