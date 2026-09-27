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

/** Share of rows with nothing in this column; null when there are too few rows to judge. */
export function emptyShare<T>(rows: readonly T[], column: MatrxColumnDef<T>): number | null {
  if (rows.length < MIN_ROWS_TO_JUDGE) return null;
  let empty = 0;
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
