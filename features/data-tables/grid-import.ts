/**
 * THE ONE READING OF AN IMPORTED FILE (lane REFUSAL-SWEEP, 2026-09-23).
 *
 * VERIFIER-16 found the create-a-table import answer "CSV file is empty" for a
 * one-line file. The class was not one bad check but one bad ASSUMPTION made in
 * three places (CSV, Excel, paste): every parser was asked for `header: true`,
 * so the first line was silently taken as column names, and a file whose first
 * line was the only data left zero rows — which the next line then called
 * "empty". A file with content in it was refused as having none, and nothing
 * on the screen said why, or offered the obvious fix.
 *
 * So the parsers now return the RAW grid, and two questions are answered here,
 * once, for all three:
 *   1. Is there anything in it at all? (the only real refusal)
 *   2. Is the first row column names or data? — a GUESS, shown as a guess, and
 *      the person can flip it (the Google Sheets / Airtable import behaviour).
 */
import { inferDataType } from "./type-inference";

export type Grid = string[][];

/** Cells as text, BOM stripped, fully blank lines dropped. */
export function cleanGrid(raw: unknown[][]): Grid {
  const rows = raw
    .map((row) => (Array.isArray(row) ? row : []).map((cell) => (cell === null || cell === undefined ? "" : String(cell))))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^﻿/, "");
  return rows;
}

function readsLikeALabel(cell: string): boolean {
  const text = cell.trim();
  if (text === "" || text.length > 60) return false;
  if (inferDataType(text) !== "string") return false;
  // A phone number, an invoice number, a ZIP+4: mostly digits is data.
  const digits = (text.match(/\d/g) ?? []).length;
  if (digits * 2 >= text.replace(/\s/g, "").length) return false;
  // An email or a web address is a value somebody typed, not a column name.
  if (/@|^https?:\/\//i.test(text)) return false;
  return true;
}

/**
 * Whether the first row reads like column names.
 *
 * ONE LINE IS DATA. A one-line file is far more often one record than a table
 * with no rows, and reading it as data never loses a word — flipping the switch
 * turns the same line into column names.
 */
export function firstRowLooksLikeHeader(grid: Grid): boolean {
  if (grid.length < 2) return false;
  const first = grid[0]!;
  if (!first.every(readsLikeALabel)) return false;
  const seen = new Set(first.map((c) => c.trim().toLowerCase()));
  if (seen.size !== first.length) return false;
  const below = grid.slice(1);
  // A column's first cell that ALSO appears further down is a value, not a name.
  return !first.some((cell, i) => below.some((row) => (row[i] ?? "").trim().toLowerCase() === cell.trim().toLowerCase()));
}

/** Column names, unique and never blank, and the rows keyed by them. */
export function tableFromGrid(
  grid: Grid,
  firstRowIsHeader: boolean,
): { columns: string[]; rows: Record<string, string>[] } {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const named = firstRowIsHeader ? grid[0] ?? [] : [];
  const columns: string[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < width; i += 1) {
    const base = (named[i] ?? "").trim() || `Column ${i + 1}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
    taken.add(name.toLowerCase());
    columns.push(name);
  }
  const body = firstRowIsHeader ? grid.slice(1) : grid;
  const rows = body.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i] ?? ""])));
  return { columns, rows };
}
