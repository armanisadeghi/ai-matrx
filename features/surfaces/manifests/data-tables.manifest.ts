/**
 * Surface manifest — Data tables (`matrx-user/data-tables`).
 *
 * User-generated tables / spreadsheet views (route `/data/[id]`). The user
 * browses and edits rows in a custom table they created, with sorting,
 * pagination, search, and per-cell editing.
 *
 * Agents bound here operate on a cell (clean / reformat this value), a row
 * (enrich this record), a column (classify all values), or the whole table
 * (summarize, find anomalies). The table is a natural persistence target for
 * agent output, so `table_id` + schema are first-class.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Table identity & schema (300-329) ─────────────────────────────────
  {
    name: "table_id",
    label: "Table ID",
    description:
      "UUID of the user table being viewed. Empty when no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "table_name",
    label: "Table name",
    description:
      "Name / label of the open table. Empty when no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "table_description",
    label: "Table description",
    description:
      "User-set description of the table. Empty when unset or no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 315,
  },
  {
    name: "table_schema",
    label: "Table schema",
    description:
      "Object describing the table's fields with names and data types. Empty object when no table is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 320,
  },
  {
    name: "column_list",
    label: "Columns",
    description:
      "Array of `{ name, type }` for every column. Empty array when no table is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 325,
  },
  {
    name: "row_count",
    label: "Row count",
    description:
      "Total number of rows in the table (across all pages). Zero when empty or no table is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 328,
  },

  // ── Active selection (340-369) ────────────────────────────────────────
  {
    name: "current_cell_value",
    label: "Current cell value",
    description:
      "Value of the selected cell, stringified. Empty when no cell is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 340,
  },
  {
    name: "current_column_name",
    label: "Current column",
    description:
      "Name of the column containing the active cell / selection. Empty when none is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 345,
  },
  {
    name: "current_row_id",
    label: "Current row ID",
    description:
      "Primary key / id of the selected row. Empty when no row is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 350,
  },
  {
    name: "current_row_json",
    label: "Current row",
    description:
      "The selected row as a JSON object keyed by column name. Empty object when no row is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 355,
  },
  {
    name: "selected_range",
    label: "Selected range",
    description:
      "Object describing a multi-cell selection as `{ rows: [...], columns: [...] }`. Empty object when no range is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 360,
  },

  // ── Data body (370-399) ───────────────────────────────────────────────
  {
    name: "visible_data_csv",
    label: "Visible rows (CSV)",
    description:
      "The currently-visible page of rows as CSV (header row + data rows). Empty when no data is visible.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 370,
  },
  {
    name: "full_table_json",
    label: "Full table (JSON)",
    description:
      "All rows of the table as an array of JSON objects. Can be very large — bind with care. Empty array when the table is empty or no table is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 380,
  },
  {
    name: "search_term",
    label: "Search term",
    description:
      "Active table search/filter string. Empty when the search box is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 390,
  },
];

export const dataTablesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/data-tables",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createDataTablesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  table_id?: string;
  table_name?: string;
  table_description?: string;
  table_schema?: Record<string, unknown>;
  column_list?: Array<{ name: string; type?: string }>;
  row_count?: number;
  current_cell_value?: string;
  current_column_name?: string;
  current_row_id?: string;
  current_row_json?: Record<string, unknown>;
  selected_range?: { rows?: unknown[]; columns?: unknown[] };
  visible_data_csv?: string;
  full_table_json?: unknown[];
  search_term?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
