/**
 * Pure mutation utilities for markdown table data.
 *
 * Every function takes a TableShape and returns a new TableShape. Inputs are
 * never mutated. normalizedData is regenerated whenever it was present and
 * the shape (rows or headers) changes.
 *
 * These run inside React event handlers, so they must be cheap enough for
 * tables in the low-thousands-of-cells range. They are intentionally NOT
 * called during streaming — the consuming components gate every call on
 * `editMode !== "none"`, which is itself only reachable when the stream
 * has completed.
 */

import { unwrapCodeSpans } from "@/lib/markdown/code-ranges";

export type TableShape = {
  headers: string[];
  rows: string[][];
  normalizedData?: Array<{ [key: string]: string }>;
};

const cleanHeaderForKey = (header: string): string =>
  unwrapCodeSpans(header)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1|$2")
    .trim();

const buildNormalizedRow = (
  headers: string[],
  row: string[],
): { [key: string]: string } => {
  const obj: { [key: string]: string } = {};
  headers.forEach((header, i) => {
    obj[cleanHeaderForKey(header)] = i < row.length ? row[i] : "";
  });
  return obj;
};

const rebuildNormalizedData = (table: TableShape): TableShape => {
  if (!table.normalizedData) return table;
  return {
    ...table,
    normalizedData: table.rows.map((row) =>
      buildNormalizedRow(table.headers, row),
    ),
  };
};

const emptyRow = (colCount: number): string[] =>
  Array.from({ length: colCount }, () => "");

const ensureUniqueHeader = (label: string, existing: string[]): string => {
  if (!existing.includes(label)) return label;
  let counter = 2;
  while (existing.includes(`${label} ${counter}`)) {
    counter++;
  }
  return `${label} ${counter}`;
};

// ============================================================================
// ROW MUTATIONS
// ============================================================================

/** Insert an empty row at a specific index. Out-of-range indices append. */
export const insertRow = (table: TableShape, atIndex?: number): TableShape => {
  const colCount = table.headers.length;
  const newRow = emptyRow(colCount);
  const insertAt =
    atIndex === undefined || atIndex < 0 || atIndex > table.rows.length
      ? table.rows.length
      : atIndex;
  const newRows = [
    ...table.rows.slice(0, insertAt),
    newRow,
    ...table.rows.slice(insertAt),
  ];
  return rebuildNormalizedData({ ...table, rows: newRows });
};

export const insertRowAbove = (
  table: TableShape,
  atIndex: number,
): TableShape => insertRow(table, atIndex);

export const insertRowBelow = (
  table: TableShape,
  atIndex: number,
): TableShape => insertRow(table, atIndex + 1);

export const appendRow = (table: TableShape): TableShape =>
  insertRow(table, table.rows.length);

export const removeRow = (table: TableShape, atIndex: number): TableShape => {
  if (atIndex < 0 || atIndex >= table.rows.length) return table;
  const newRows = table.rows.filter((_, i) => i !== atIndex);
  return rebuildNormalizedData({ ...table, rows: newRows });
};

/** Empty the cells of a row but keep the row (preserves row count). */
export const clearRow = (table: TableShape, atIndex: number): TableShape => {
  if (atIndex < 0 || atIndex >= table.rows.length) return table;
  const colCount = table.headers.length;
  const cleared = emptyRow(colCount);
  const newRows = table.rows.map((row, i) => (i === atIndex ? cleared : row));
  return rebuildNormalizedData({ ...table, rows: newRows });
};

/** Duplicate a row (copy is placed immediately below the original). */
export const duplicateRow = (
  table: TableShape,
  atIndex: number,
): TableShape => {
  if (atIndex < 0 || atIndex >= table.rows.length) return table;
  const copy = [...table.rows[atIndex]];
  const newRows = [
    ...table.rows.slice(0, atIndex + 1),
    copy,
    ...table.rows.slice(atIndex + 1),
  ];
  return rebuildNormalizedData({ ...table, rows: newRows });
};

/** Remove all data rows (headers preserved). */
export const clearAllRows = (table: TableShape): TableShape =>
  rebuildNormalizedData({ ...table, rows: [] });

/**
 * Empty all data cells EXCEPT the first column (headers and first-column
 * values are preserved). Useful when the first column is a row label or
 * key the user wants to keep while wiping the rest.
 *
 * No-op when there is at most one column (nothing to clear).
 */
export const clearAllContents = (table: TableShape): TableShape => {
  if (table.headers.length <= 1) return table;
  const newRows = table.rows.map((row) =>
    row.map((cell, i) => (i === 0 ? cell : "")),
  );
  return rebuildNormalizedData({ ...table, rows: newRows });
};

// ============================================================================
// COLUMN MUTATIONS
// ============================================================================

/** Insert a new column. Out-of-range indices append. New header is uniquified. */
export const insertColumn = (
  table: TableShape,
  atIndex?: number,
  headerLabel: string = "New Column",
): TableShape => {
  const insertAt =
    atIndex === undefined || atIndex < 0 || atIndex > table.headers.length
      ? table.headers.length
      : atIndex;
  const finalHeader = ensureUniqueHeader(headerLabel, table.headers);
  const newHeaders = [
    ...table.headers.slice(0, insertAt),
    finalHeader,
    ...table.headers.slice(insertAt),
  ];
  const newRows = table.rows.map((row) => [
    ...row.slice(0, insertAt),
    "",
    ...row.slice(insertAt),
  ]);
  return rebuildNormalizedData({
    ...table,
    headers: newHeaders,
    rows: newRows,
  });
};

export const insertColumnBefore = (
  table: TableShape,
  atIndex: number,
  headerLabel?: string,
): TableShape => insertColumn(table, atIndex, headerLabel);

export const insertColumnAfter = (
  table: TableShape,
  atIndex: number,
  headerLabel?: string,
): TableShape => insertColumn(table, atIndex + 1, headerLabel);

export const appendColumn = (
  table: TableShape,
  headerLabel?: string,
): TableShape => insertColumn(table, table.headers.length, headerLabel);

export const removeColumn = (
  table: TableShape,
  atIndex: number,
): TableShape => {
  if (atIndex < 0 || atIndex >= table.headers.length) return table;
  const newHeaders = table.headers.filter((_, i) => i !== atIndex);
  const newRows = table.rows.map((row) => row.filter((_, i) => i !== atIndex));
  return rebuildNormalizedData({
    ...table,
    headers: newHeaders,
    rows: newRows,
  });
};

/** Empty all data cells in a column but keep the header. */
export const clearColumn = (table: TableShape, atIndex: number): TableShape => {
  if (atIndex < 0 || atIndex >= table.headers.length) return table;
  const newRows = table.rows.map((row) =>
    row.map((cell, i) => (i === atIndex ? "" : cell)),
  );
  return rebuildNormalizedData({ ...table, rows: newRows });
};

/** Duplicate a column (copy header gets " (copy)" suffix; placed immediately to the right). */
export const duplicateColumn = (
  table: TableShape,
  atIndex: number,
): TableShape => {
  if (atIndex < 0 || atIndex >= table.headers.length) return table;
  const baseHeader = table.headers[atIndex];
  const copyHeader = ensureUniqueHeader(`${baseHeader} (copy)`, table.headers);
  const newHeaders = [
    ...table.headers.slice(0, atIndex + 1),
    copyHeader,
    ...table.headers.slice(atIndex + 1),
  ];
  const newRows = table.rows.map((row) => [
    ...row.slice(0, atIndex + 1),
    row[atIndex] ?? "",
    ...row.slice(atIndex + 1),
  ]);
  return rebuildNormalizedData({
    ...table,
    headers: newHeaders,
    rows: newRows,
  });
};
