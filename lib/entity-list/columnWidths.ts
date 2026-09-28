// lib/entity-list/columnWidths.ts
//
// COLUMN WIDTHS THAT FOLLOW THE DATA (page-pass 2026-09-27). At 1280px a list's
// declared widths added up past its container (1376px in 1210px on
// /education/flashcards): the row's own actions sat off the right edge while
// Topic, Difficulty and Folders — "—" in almost every row — held their full
// declared width, and the name was truncated. Two rules, applied to the rows
// the table is about to render:
//
// 1. A MOSTLY-EMPTY COLUMN YIELDS. When at least `MOSTLY_EMPTY` of the loaded
//    rows have nothing in a column, its declared width drops to `YIELD_WIDTH`
//    (enough for its header, sort and filter controls). It grows back the moment
//    the rows carry values.
// 2. THE NAME IS PINNED. The identity column (and a leading favorite/marker
//    column before it) freezes on the left from `sm:` up, with an explicit width
//    — the package freezes only columns whose widths it knows
//    (@ai-matrx/design-system `frozen-columns.ts`). The row actions column is
//    pinned right by the package itself.

import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { resolveColumnMarker } from "@ai-matrx/design-system/data-table";

export const MOSTLY_EMPTY = 0.7;
export const YIELD_WIDTH = 120;
export const MIN_ROWS_TO_JUDGE = 3;
export const PINNED_NAME_WIDTH = 280;
export const PINNED_NAME_MAX = 360;
const MARKER_WIDTH = 40;

export function isEmptyCellValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t === "—" || t === "-";
  }
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function columnKey<T>(column: MatrxColumnDef<T>): string | undefined {
  return column.id ?? column.accessorKey;
}

function valueOf<T>(row: T, column: MatrxColumnDef<T>): unknown {
  if (column.accessorFn) return column.accessorFn(row);
  const key = column.accessorKey ?? column.id;
  if (!key || typeof row !== "object" || row === null) return undefined;
  return (row as Record<string, unknown>)[key];
}

/**
 * True when this row has nothing in this column (null, "", "—", []).
 *
 * A column with no accessor whose id is not a field of the row is an ACTION
 * or computed cell (a Study button) — its value cannot be read, so it is never
 * judged empty (page-pass 2026-09-27: the flashcards Study buttons vanished
 * from every phone card because `row.study` is undefined).
 */
export function cellIsEmpty<T>(row: T, column: MatrxColumnDef<T>): boolean {
  if (isUnreadableColumn(row, column)) return false;
  return isEmptyCellValue(valueOf(row, column));
}

function isUnreadableColumn<T>(row: T, column: MatrxColumnDef<T>): boolean {
  if (column.accessorFn || column.accessorKey) return false;
  const key = column.id;
  return (
    !key || typeof row !== "object" || row === null || !(key in (row as object))
  );
}

/** Share of rows with nothing in this column; null when there are too few rows to judge. */
export function emptyShare<T>(rows: readonly T[], column: MatrxColumnDef<T>): number | null {
  if (rows.length < MIN_ROWS_TO_JUDGE) return null;
  let empty = 0;
  if (isUnreadableColumn(rows[0], column)) return null;
  for (const row of rows) if (isEmptyCellValue(valueOf(row, column))) empty++;
  return empty / rows.length;
}

export function fitColumnWidths<T>(
  columns: MatrxColumnDef<T>[],
  rows: readonly T[],
  nameColumnId: string | undefined,
): MatrxColumnDef<T>[] {
  const nameIndex = nameColumnId
    ? columns.findIndex((c) => columnKey(c) === nameColumnId)
    : -1;
  // Only a LEADING run freezes: every column before the name must be a marker
  // (favorite / pin), or nothing is pinned.
  const canPin =
    nameIndex >= 0 &&
    columns.slice(0, nameIndex).every((c) => Boolean(resolveColumnMarker(c)));
  return columns.map((column, index) => {
    if (canPin && index < nameIndex) {
      return { ...column, frozen: true, width: column.width ?? MARKER_WIDTH };
    }
    if (canPin && index === nameIndex) {
      const declared = typeof column.width === "number" ? column.width : PINNED_NAME_WIDTH;
      return { ...column, frozen: true, width: Math.min(declared, PINNED_NAME_MAX) };
    }
    if (index === nameIndex || resolveColumnMarker(column) || column.compact) return column;
    if (typeof column.width !== "number" || column.width <= YIELD_WIDTH) return column;
    const share = emptyShare(rows, column);
    if (share === null || share < MOSTLY_EMPTY) return column;
    return { ...column, width: YIELD_WIDTH };
  });
}

/**
 * UNIFORM COLUMNS (page-pass 2026-09-27, /education/quizzes): a column that is
 * empty in every loaded row, or holds the same value in every one, says nothing
 * per row. A surface that opts in (`EntityListConfig.autoHideUniformColumns`)
 * has such columns hidden BY DEFAULT — they stay in the column picker, and a
 * column the person showed stays shown (`ListViewPrefs.shownColumns`). Only a
 * column with a real accessor is judged (a Study / Actions column of buttons
 * has no value to compare), never `keep` ids (the name / door column).
 */
export function uniformColumnIds<T>(
  columns: readonly { id: string; column: MatrxColumnDef<T>; locked?: boolean }[],
  rows: readonly T[],
  keep: readonly (string | null | undefined)[] = [],
  /** Every row of the list is loaded (no further page): the rows ARE the list. */
  options: { complete?: boolean } = {},
): string[] {
  // An all-EMPTY column is empty at any row count (/connected-sources with 2
  // rows showed a column of dashes). "The same value on every row" needs
  // MIN_ROWS_TO_JUDGE rows — or 2 when those rows are the whole list
  // (/connected-sources: "From" repeated one value on its only 2 rows).
  if (rows.length === 0) return [];
  const judgeIdentical = rows.length >= MIN_ROWS_TO_JUDGE || (options.complete === true && rows.length >= 2);
  const out: string[] = [];
  for (const spec of columns) {
    if (spec.locked || keep.includes(spec.id)) continue;
    const col = spec.column;
    if (!col.accessorFn && !col.accessorKey) continue;
    if (resolveColumnMarker(col)) continue;
    const seen = new Set<string>();
    for (const row of rows) {
      const v = valueOf(row, col);
      seen.add(isEmptyCellValue(v) ? "\u0000empty" : JSON.stringify(v));
      if (seen.size > 1) break;
    }
    if (seen.size === 1 && (judgeIdentical || seen.has("\u0000empty"))) out.push(spec.id);
  }
  return out;
}

/**
 * The hidden set a list draws: the person's stored hidden columns plus the
 * auto-hidden uniform ones they have not explicitly shown.
 */
export function effectiveHiddenColumns(
  stored: readonly string[],
  autoHidden: readonly string[],
  shown: readonly string[] = [],
): string[] {
  const shownSet = new Set(shown);
  return [...new Set([...stored, ...autoHidden.filter((id) => !shownSet.has(id))])];
}

/**
 * The prefs patch for a picker change made over the EFFECTIVE hidden set: a
 * column taken out of it is remembered as explicitly shown, so an auto-hide
 * never takes it back.
 */
export function hiddenColumnsPatch(
  nextHidden: readonly string[],
  effectiveHidden: readonly string[],
  shown: readonly string[] = [],
): { hiddenColumns: string[]; shownColumns: string[] } {
  const next = new Set(nextHidden);
  const newlyShown = effectiveHidden.filter((id) => !next.has(id));
  return {
    hiddenColumns: [...next],
    shownColumns: [...new Set([...shown, ...newlyShown])].filter((id) => !next.has(id)),
  };
}
