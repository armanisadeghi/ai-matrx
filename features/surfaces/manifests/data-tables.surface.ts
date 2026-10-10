/**
 * Names and scope builder of `data-tables`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";


/**
 * One column as emitted in the `column_list` surface value.
 *
 * `name` is the machine field name (what `cell_value` writes against);
 * `display_name` is the header the user sees.
 */
export interface DataTableColumnEntry {
  name: string;
  display_name: string;
  type: string;
  required: boolean;
  order: number;
  /**
   * The column's DISPLAY format, when it has one — `percent`, `currency`,
   * `choice`, … Present because the storage type alone is a lie to whoever has
   * to write the cell: a `percent` column typed `number` holding `45` means
   * 45%, and an agent that cannot see the format cannot tell that from 0.45.
   */
  format?: string;
  /**
   * The values a `choice` / `multi_choice` column offers. A write outside this
   * list is not rejected — off-list values are legal and render in amber — but
   * an agent that can SEE the options has no reason to invent a new one.
   *
   * Omitted for a column bound to a pick list whose options have not loaded,
   * so an empty list never reads as "this column has no options".
   */
  choices?: string[];
  /**
   * How each choice VALUE reads to a person, when the two differ — a `person`
   * column stores user ids and shows names. Keys are entries of `choices`.
   * A write must send the VALUE (the key), never the label. Omitted when
   * values and labels are the same thing.
   */
  choice_labels?: Record<string, string>;
  /**
   * The column's VALIDATION RULES, in plain English — the same phrases the row
   * forms print under the input (`describeValidationRules`). Present because a
   * `cell_value` write that breaks one is REFUSED, and an agent that cannot see
   * the rule can only discover it by failing. Omitted when the column
   * constrains nothing.
   */
  validation?: string[];
}

export function createDataTablesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  selected_range_tsv?: string;
  selected_range_cell_count?: number;
  selected_rows_json?: unknown[];
  table_id?: string;
  table_name?: string;
  table_description?: string;
  row_label_rule?: string;
  is_read_only?: boolean;
  table_schema?: Record<string, unknown>;
  column_list?: DataTableColumnEntry[];
  row_actions?: { id: string; name: string; kind: "update" | "agent"; description: string }[];
  row_count?: number;
  not_loaded_yet?: boolean;
  brief_columns?: string;
  brief_first_rows?: string;
  current_cell_value?: string;
  current_column_name?: string;
  current_row_id?: string;
  current_row_json?: Record<string, unknown>;
  current_row_label?: string;
  visible_data_csv?: string;
  full_table_json?: unknown[];
  search_term?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
