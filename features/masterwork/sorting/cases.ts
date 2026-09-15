// features/masterwork/sorting/cases.ts
//
// THE FOUR DOORS a pile of cases comes in through, as pure functions.
//
// Three of them are here (paste, spreadsheet, picked records); the fourth —
// "write me twenty" — is a server call and lives in `service.ts`. They are pure
// so the sorting surface never has to know where a case came from: by the time
// it reaches the table, a pasted line, a spreadsheet cell and a CRM row are the
// same `SortCase`, which is exactly what makes the boundary arithmetic
// comparable across them.
//
// 🚨 THE PICKER OFFERS WHAT THE READER READS. `SHEET_ACCEPT` is the file input's
// `accept` and `readSheet` is the only reader — the same one-list discipline
// `aidream/services/distillation/source_types.py` states for the upload lane,
// which exists because a picker that invited `.txt` and a server that refused
// it was the platform lying to the person using it (2026-09-12).

import { caseId, type SortCase } from "./types";

/**
 * What a round may hold. Not a knob: it is not a preference, it is the point
 * past which no human sorts a pile with their thumb, and the every-pair
 * boundary scan is quadratic. A longer paste is read to here and SAYS so.
 */
export const MAX_CASES = 200;

/**
 * Exactly what the file picker may advertise — the formats SheetJS reads, and
 * nothing else. A spreadsheet exported from anywhere lands as one of these.
 */
export const SHEET_ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls,.ods";

/** A sheet as the Expert's file actually came out: a grid of strings. */
export interface SheetData {
  /** The first row, used as column names when it looks like a header. */
  headers: string[];
  /** Every row INCLUDING the first — whether row 1 is a header is the
   *  Expert's call on screen, never a heuristic that silently eats a case. */
  rows: string[][];
  /** How many rows the file held, before `MAX_CASES` was applied. */
  totalRows: number;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupe(texts: { text: string; note: string }[]): SortCase[] {
  const seen = new Set<string>();
  const out: SortCase[] = [];
  for (const entry of texts) {
    const text = entry.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: caseId(), text: text.slice(0, 2000), note: entry.note });
    if (out.length >= MAX_CASES) break;
  }
  return out;
}

/**
 * A pasted list → cases. ONE CASE PER LINE, which is the shape a person's own
 * list is already in when they copy it out of anywhere.
 *
 * Blank lines separate nothing and are dropped; a leading bullet, dash or "1."
 * is list furniture the Expert did not type as part of the case, so it goes
 * too. A repeated line is dropped rather than sorted twice — the same case in
 * two piles is not a boundary, it is a mistake.
 */
export function parsePastedCases(raw: string, note = ""): SortCase[] {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  return dedupe(lines.map((text) => ({ text, note })));
}

/**
 * Read a spreadsheet or CSV in the browser. SheetJS is loaded on demand — it
 * is ~1 MB and most sittings never open this door.
 *
 * Throws with a sentence the Expert can act on. NOTHING FAILS SILENTLY: a file
 * that cannot be read says what happened and what to do instead, never an
 * empty table.
 */
export async function readSheet(file: File): Promise<SheetData> {
  let rows: string[][];
  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const book = XLSX.read(buffer, { type: "array" });
    const first = book.SheetNames[0];
    if (!first) throw new Error("no sheets");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[first], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });
    rows = grid.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) =>
        cell === null || cell === undefined ? "" : String(cell).trim(),
      ),
    );
  } catch (err) {
    throw new Error(
      `We couldn't read “${file.name}”. We read CSV, TSV, plain text and Excel ` +
        `or OpenDocument spreadsheets — export it as one of those, or paste the ` +
        `list in instead.` +
        (err instanceof Error && err.message ? ` (${err.message})` : ""),
    );
  }
  rows = rows.filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) {
    throw new Error(
      `“${file.name}” has no rows in it. Check you exported the right sheet, or ` +
        `paste the list in instead.`,
    );
  }
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => {
    const copy = row.slice(0, width);
    while (copy.length < width) copy.push("");
    return copy;
  });
  return {
    headers: padded[0],
    rows: padded.slice(0, MAX_CASES + 1),
    totalRows: padded.length,
  };
}

/**
 * Which column is most likely to BE the case: the one with the most words per
 * row. A sheet of leads has an id column, a date column and one column of
 * actual description, and that is the one somebody sorts on.
 *
 * A suggestion, never a decision — the surface shows it as a chosen column the
 * Expert can change, because a silently wrong guess here sorts a round of
 * customer IDs.
 */
export function suggestColumn(sheet: SheetData): number {
  const body = sheet.rows.slice(1).length ? sheet.rows.slice(1) : sheet.rows;
  let best = 0;
  let bestScore = -1;
  const width = sheet.headers.length;
  for (let column = 0; column < width; column += 1) {
    let score = 0;
    for (const row of body) score += (row[column] ?? "").trim().split(/\s+/).filter(Boolean).length;
    const average = body.length ? score / body.length : 0;
    if (average > bestScore) {
      bestScore = average;
      best = column;
    }
  }
  return best;
}

/** True when row 1 reads like column names rather than a case. */
export function looksLikeHeader(sheet: SheetData): boolean {
  const first = sheet.rows[0] ?? [];
  if (first.length === 0) return false;
  const short = first.every((cell) => cell.split(/\s+/).filter(Boolean).length <= 4);
  const noSentences = first.every((cell) => !/[.!?]$/.test(cell.trim()));
  return short && noSentences && sheet.rows.length > 1;
}

/**
 * A sheet plus the Expert's column choice → cases. The row number rides along
 * as the note, so a case on the table can be found again in her own file.
 */
export function casesFromSheet(
  sheet: SheetData,
  column: number,
  { skipFirstRow }: { skipFirstRow: boolean },
): SortCase[] {
  const body = skipFirstRow ? sheet.rows.slice(1) : sheet.rows;
  return dedupe(
    body.map((row, index) => ({
      text: row[column] ?? "",
      note: `row ${index + (skipFirstRow ? 2 : 1)}`,
    })),
  );
}

/**
 * Picked records → cases. The record's own NAME is the case: that is what the
 * Expert is actually judging when she works a queue of leads, files or past
 * outputs, and it is the handle she would use to talk about it afterwards.
 */
export function casesFromRecords(
  records: { token: string; id: string; title: string }[],
): SortCase[] {
  return dedupe(
    records.map((record) => ({
      text: record.title,
      note: record.token.replace(/_/g, " "),
    })),
  );
}
