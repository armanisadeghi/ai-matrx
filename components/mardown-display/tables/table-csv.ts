import { toDelimitedText } from "@ai-matrx/alchemy/operate/read";

/** A markdown-table cell that is exactly a plain decimal number (so "007", "1e3", "-" stay text). */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function cellValue(cell: string): string | number {
  if (PLAIN_NUMBER.test(cell)) {
    const n = Number(cell);
    // A number a spreadsheet would round or reformat ("0.10", "12345678901234567890") stays text.
    if (String(n) === cell) return n;
  }
  return cell;
}

/**
 * The CSV text of a markdown/streaming table, written by Alchemy's one writer. Quotes, commas and
 * line breaks are quoted; text that opens with = + - @ is prefixed `'` so a spreadsheet never runs
 * it (alchemy `spreadsheetSafe`, on). A cell that is a plain number is written as a number, so a
 * negative amount stays `-5`.
 */
export function tableToCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return toDelimitedText(
    headers,
    rows.map((row) => row.map(cellValue)),
    { spreadsheetSafe: true },
  );
}
