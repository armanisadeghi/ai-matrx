/**
 * Bulk row actions — what selecting rows is FOR.
 *
 * The grid has had checkboxes, shift-click ranges and a "12 rows selected" bar
 * for a long time, and the bar's only two buttons were "Select this page" and
 * "Clear selection". Selecting rows led nowhere: the user made a selection and
 * the surface had nothing to offer them. This module is the answer.
 *
 * Every action compiles to ONE `udt_bulk_write` call, which is one transaction.
 * That matters more than it looks: deleting 40 rows as 40 requests can half-
 * succeed, and a half-finished bulk delete is unrecoverable by hand because the
 * user no longer knows which 17 went. One op list, one transaction, one result.
 *
 * Pure module: these functions build op lists and never talk to Supabase, so
 * the mapping from "what the user asked for" to "what gets written" is testable
 * without a database.
 */

import type { BulkOp } from "./types";

/** A row as the grid holds it — only what the builders actually read. */
export type SelectableRow = {
  id: string;
  data?: Record<string, unknown> | null;
};

/**
 * Delete every selected row.
 *
 * Order is preserved from the caller's selection so the result list lines up
 * with what the user picked, which is what lets a partial failure name the
 * exact rows that survived.
 */
export function buildDeleteOps(rowIds: readonly string[]): BulkOp[] {
  return rowIds.map((row_id) => ({ op: "delete", row_id }));
}

/**
 * Duplicate every selected row.
 *
 * The duplicate is an INSERT of the same `data`, never a copy of the row
 * record: `id`, timestamps and version belong to the new row, and carrying the
 * original's id across would either collide or silently overwrite.
 */
export function buildDuplicateOps(
  rows: readonly SelectableRow[],
): BulkOp[] {
  return rows.map((row) => ({
    op: "insert",
    data: { ...(row.data ?? {}) },
  }));
}

/**
 * Set ONE column to ONE value across every selected row.
 *
 * `op: "cell"` rather than `merge` on purpose — a cell op is surgical and
 * cannot touch a field the user did not name, which is the whole reason this is
 * safe to offer over a 500-row selection.
 */
export function buildSetColumnOps(
  rowIds: readonly string[],
  fieldName: string,
  value: unknown,
): BulkOp[] {
  return rowIds.map((row_id) => ({
    op: "cell",
    row_id,
    field_name: fieldName,
    value,
  }));
}

/**
 * Fill a column DOWN from the first selected row into the rest.
 *
 * The spreadsheet reflex. The source is the first row in the caller's order —
 * which is display order, not selection order, so "fill down" fills downward
 * on screen rather than from whichever row happened to be clicked first.
 *
 * Returns an empty list when there is nothing to fill (fewer than two rows), so
 * the caller can skip the write entirely instead of sending a no-op transaction.
 */
export function buildFillDownOps(
  rows: readonly SelectableRow[],
  fieldName: string,
): BulkOp[] {
  if (rows.length < 2) return [];
  const source = rows[0]?.data?.[fieldName] ?? null;
  return rows.slice(1).map((row) => ({
    op: "cell",
    row_id: row.id,
    field_name: fieldName,
    value: source,
  }));
}

/**
 * The prior values a bulk column write is about to overwrite.
 *
 * Captured BEFORE the write and handed to the undo stack, for the same reason a
 * single-cell edit captures its inverse up front: re-reading afterwards races
 * with realtime and with agent writes, and would "undo" to whatever someone
 * else set in the meantime.
 */
export function capturePriorValues(
  rows: readonly SelectableRow[],
  fieldName: string,
): Map<string, unknown> {
  const prior = new Map<string, unknown>();
  for (const row of rows) prior.set(row.id, row.data?.[fieldName] ?? null);
  return prior;
}

/** Selected rows in DISPLAY order — never in the order they were clicked. */
export function orderSelectedRows(
  displayRows: readonly SelectableRow[],
  selectedIds: readonly string[],
): SelectableRow[] {
  const wanted = new Set(selectedIds);
  return displayRows.filter((row) => wanted.has(row.id));
}

/**
 * Selected rows as TSV, ready for a spreadsheet paste.
 *
 * Tab-separated because that is what Excel, Sheets and Numbers accept from the
 * clipboard directly. Values containing a tab or newline are quoted so a
 * multi-line cell cannot silently become several columns.
 */
export function selectedRowsToTsv(
  rows: readonly SelectableRow[],
  fields: readonly { field_name: string; display_name: string }[],
): string {
  const cell = (raw: unknown): string => {
    const text =
      raw === null || raw === undefined
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw);
    return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = fields.map((f) => cell(f.display_name)).join("\t");
  const body = rows.map((row) =>
    fields.map((f) => cell(row.data?.[f.field_name])).join("\t"),
  );
  return [header, ...body].join("\n");
}
