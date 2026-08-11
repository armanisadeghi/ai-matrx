/**
 * Runtime scope builder for the `matrx-user/data-tables` surface.
 *
 * Called at Run time (never on mount) by the `SurfaceRuntimeProvider` that
 * `UserTableViewer` mounts on the `/data/[id]` route. It takes the viewer's
 * RAW live state and derives the declared values — nothing is fabricated: a
 * value the page genuinely does not have is OMITTED rather than faked, which
 * is what lets the manifest's "empty when …" descriptions stay true.
 *
 * Everything goes out through `createDataTablesScope` so the manifest's type
 * contract is enforced: a key that is not declared cannot be emitted, and a
 * declared key that is renamed breaks the build rather than silently going
 * missing at runtime.
 */

import {
  createDataTablesScope,
  type DataTableColumnEntry,
} from "@/features/surfaces/manifests/data-tables.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** One column definition as the viewer holds it (a `TableField`). */
export interface DataTableScopeField {
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

/** One row as the viewer holds it. */
export interface DataTableScopeRow {
  id: string;
  data: Record<string, unknown>;
}

export interface DataTableScopeInput {
  tableId: string;
  tableName?: string;
  tableDescription?: string;
  /** Null until the table row has loaded — permission is unknown before that. */
  isReadOnly: boolean | null;
  fields: DataTableScopeField[];
  /** The page of rows currently rendered. */
  visibleRows: DataTableScopeRow[];
  /** Total rows after the active search / filters — what the pager counts. */
  totalCount: number;
  searchTerm: string;
  /**
   * The whole dataset, but ONLY when the viewer has already loaded it (it does
   * that for column filtering and whole-table sorting). Null otherwise — we
   * never trigger a fetch just to fill a surface value.
   */
  fullDataset: DataTableScopeRow[] | null;
  /**
   * The cell whose full-content editor is open, if any. This grid has no
   * persistent click-to-select cell, so this is the only sense in which a cell
   * is "current".
   */
  openCell: { rowId: string; fieldName: string; value: string } | null;
  /** The row whose row editor is open, if any. */
  openRow: { rowId: string; data: Record<string, unknown> | null } | null;
}

/** RFC4180-ish escaping: quote when the value contains a delimiter or quote. */
function csvCell(raw: unknown): string {
  const text =
    raw === null || raw === undefined
      ? ""
      : typeof raw === "object"
        ? JSON.stringify(raw)
        : String(raw);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Header is `row_id` FIRST, then machine field names — deliberately, because
 * the `cell_value` write target needs a row UUID and this is where an agent
 * reads it. A CSV of just the cells would be readable but unwritable.
 */
function rowsToCsv(
  fields: DataTableScopeField[],
  rows: DataTableScopeRow[],
): string {
  const header = ["row_id", ...fields.map((f) => f.field_name)]
    .map(csvCell)
    .join(",");
  const body = rows.map((row) =>
    [row.id, ...fields.map((f) => row.data?.[f.field_name])]
      .map(csvCell)
      .join(","),
  );
  return [header, ...body].join("\n");
}

function rowsToJson(
  rows: DataTableScopeRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => ({ row_id: row.id, ...(row.data ?? {}) }));
}

export function buildDataTablesScope(
  input: DataTableScopeInput,
): SurfaceScopePayload {
  const orderedFields = [...input.fields].sort(
    (a, b) => a.field_order - b.field_order,
  );

  const columnList: DataTableColumnEntry[] = orderedFields.map((f) => ({
    name: f.field_name,
    display_name: f.display_name,
    type: f.data_type,
    required: f.is_required,
    order: f.field_order,
  }));

  const tableSchema: Record<string, string> = {};
  for (const f of orderedFields) tableSchema[f.field_name] = f.data_type;

  // The "current" row is whichever editor is open — the cell editor wins, since
  // it is the more specific of the two.
  const currentRowId = input.openCell?.rowId ?? input.openRow?.rowId;
  const currentRowData =
    input.openCell !== null
      ? input.visibleRows.find((r) => r.id === input.openCell!.rowId)?.data
      : (input.openRow?.data ?? undefined);

  return createDataTablesScope({
    table_id: input.tableId,
    ...(input.tableName ? { table_name: input.tableName } : {}),
    ...(input.tableDescription
      ? { table_description: input.tableDescription }
      : {}),
    ...(input.isReadOnly !== null ? { is_read_only: input.isReadOnly } : {}),

    ...(orderedFields.length > 0
      ? { table_schema: tableSchema, column_list: columnList }
      : {}),
    row_count: input.totalCount,

    ...(input.openCell
      ? {
          current_cell_value: input.openCell.value,
          current_column_name: input.openCell.fieldName,
        }
      : {}),
    ...(currentRowId ? { current_row_id: currentRowId } : {}),
    ...(currentRowData ? { current_row_json: currentRowData } : {}),

    ...(orderedFields.length > 0 && input.visibleRows.length > 0
      ? { visible_data_csv: rowsToCsv(orderedFields, input.visibleRows) }
      : {}),
    ...(input.fullDataset
      ? { full_table_json: rowsToJson(input.fullDataset) }
      : {}),
    ...(input.searchTerm ? { search_term: input.searchTerm } : {}),
  });
}
