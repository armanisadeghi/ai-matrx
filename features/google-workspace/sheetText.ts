import { parseDelimited, toDelimited } from "@ai-matrx/kit/delimited";

/**
 * A sheet's cells as editable TSV and back, through THE one writer and reader (kit), so a cell
 * holding a tab, a line break or a quote survives the round trip into the customer's sheet.
 * Lossless both ways: no formula guard on write, none stripped on read (`=SUM(A1)` the person
 * typed is a formula they meant; a `'` they typed is theirs).
 */
export function sheetValuesToText(values: readonly (readonly unknown[])[]): string {
  return toDelimited(
    values.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))),
    { format: "tsv", spreadsheetSafe: false },
  );
}

export function sheetTextToValues(text: string): string[][] {
  const rows = parseDelimited(text, { delimiter: "\t", unguardFormulas: false }).data;
  // An emptied box still writes one empty cell (clears the range's first cell), as before.
  return rows.length > 0 ? rows : [[""]];
}
