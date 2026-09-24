/**
 * Data-tables service — typed wrappers for the P1 agent-write RPC layer.
 *
 * Use these from any client-side code (React components, hooks, agent tools)
 * instead of calling `supabase.rpc('udt_*')` directly. The wrappers guarantee:
 *   - typed arguments (matches the actual RPC signature)
 *   - typed responses (matches what the SECURITY DEFINER function returns)
 *   - consistent `ServiceResult<T>` error envelope
 *
 * These functions consume the *new* RPCs introduced in migration
 * `udt_v2_backbone`:
 *   - udt_upsert_row  (insert if row_id null, else update)
 *   - udt_upsert_cell (surgical jsonb_set on one field)
 *   - udt_bulk_write  (one-transaction batch of mixed ops)
 *   - udt_change_field_type (safe column type migration with row rewrite)
 *
 * The pre-existing RPCs (`add_data_row_to_user_table`, `update_data_row_in_user_table`,
 * etc.) are still consumed directly by `components/user-generated-table-data/**`
 * and `utils/user-table-utls/**`. Those callsites will migrate to this service
 * in P2; do not duplicate that logic here.
 *
 * See `features/data-tables/FEATURE.md` for architectural context.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPgError } from "@ai-matrx/records/core";

import { supabase } from "@/utils/supabase/client";

import type { FieldFormatConfig } from "@/lib/field-formats/types";

import { rewriteFormulaReferences } from "./formulas";
import * as recordStore from "./data-source/record-store";
import { placeTableInRecordStore, recordStoreHomeOf } from "./data-source/table-home";
import { recordChangeActions } from "./data-source/record-store-grid";
import { recordChangeTrigger } from "@ai-matrx/records";

import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { parseTableMetadata } from "./types";
import { operationFailed } from "@/utils/errors";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
import {
  addColumn as addColumnToOlderTable,
  addRow as addRowToOlderTable,
  createTable as createOlderTable,
  getTableDetails as getOlderTableDetails,
  type AddColumnParams,
  type AddColumnResult,
  type CreateTableParams,
  type CreateTableResult,
  type GetTableResult,
} from "@/utils/user-table-utls/table-utils";
import { whereANewTableIsBorn } from "./data-source/where-a-table-is-born";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import type {
  BulkOp,
  BulkWriteResponse,
  ChangeFieldTypeResponse,
  ChangeFieldTypeStrategy,
  ColumnFacets,
  DatasetRow,
  FieldDataType,
  ServiceErr,
  ServiceResult,
  TableMetadata,
  TableProfile,
  ValidationMode,
} from "./types";


/**
 * THE STORE'S REFUSAL, WHOLE (lane FIX-15, 2026-09-23).
 *
 * Every door in this file used to answer `{ success: false, error: error.message }`,
 * which keeps the first clause of a refusal and throws away the DETAIL and the HINT —
 * the two parts that say what the column actually is and what to do instead. A screen
 * cannot draw a sentence it was never handed.
 *
 * `mapPgError` is `@ai-matrx/records`'s own mapper — the same one the unified store
 * uses — so a refusal from the older tables arrives in the shape `RefusalNotice`
 * already knows how to draw, and the SQLSTATE stays out of sight where it belongs.
 * `error` is untouched, so every existing caller that prints a line still works.
 */
function refused(error: { message: string; code?: string; hint?: string; details?: string }): ServiceErr {
  return { success: false, error: error.message, refusal: mapPgError(error, "the older data tables") };
}

/**
 * THE DATA SEAM (lane GRID-PORT). Every export below asks `table-home.ts` which
 * store holds its table first: a record-store table goes to
 * `data-source/record-store.ts`, anything else runs the older body under it,
 * unchanged. An operation the record-store half does not carry yet REFUSES in
 * words — it never falls through to the older door, which would write to the
 * archived copy the move left behind and report success over a table nobody
 * is looking at.
 */
function notOnTheRecordStoreYet(what: string): ServiceErr {
  return {
    success: false,
    error: `This table lives in the record store, and this grid cannot ${what} there yet. Open the table at its record-store page to do it.`,
  };
}

// ─── READS ───────────────────────────────────────────────────────────────────
//
// THE METADATA/ROWS SPLIT — read this before adding another dataset fetch.
//
// `get_user_table_complete` returns EVERY ROW of a dataset with no LIMIT
// anywhere, and derives `row_count` from `jsonb_array_length(data)`. It is the
// right call ONLY when the caller genuinely consumes every row (a full-table
// export). Calling it to learn a dataset's name, its columns, or how many rows
// it has materializes the whole dataset server-side and ships it to the browser
// so three facts can be read off the top of it.
//
// `get_full_table` is the metadata twin: full `udt_datasets` row, full
// `udt_dataset_fields` rows in `field_order`, and a real `COUNT(*)` — and no
// row data at all. Every "I only need the schema/size" caller belongs here.
//
// Two traps it carries, both handled by `getTableMetadata` below:
//   - the key is `columns`, not `fields` (its sibling RPC's name for the same
//     thing);
//   - it has NO `{success:false}` envelope. It RAISES, which arrives as a
//     PostgREST error. Never translate that into an empty state — a thrown
//     error never means "the dataset has no columns". And never translate it
//     into ABSENCE either: `get_full_table` is SECURITY INVOKER, so its gate
//     sees zero rows just as readily when RLS hid the dataset from this caller.
//     That case arrives as errcode P0002 with an honest ambiguous message and
//     is handed to AccessGate to resolve (the D167 class).

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type GetTableMetadataArgs = {
  tableId: string;
  /** Optional guard — the RPC raises if it does not match the stored name. */
  tableName?: string;
};

/**
 * A dataset's identity, column schema and row COUNT — without loading a single
 * row. This is the default read for any surface that renders a picker, a
 * column list, a settings form, a header, or a pagination total.
 *
 * `table` is the complete `udt_datasets` row, so `row_ordering_config`
 * (saved default sort) and `validation_mode` are both present — neither is
 * available from `get_user_table_complete`.
 */
export async function getTableMetadata(
  args: GetTableMetadataArgs,
): Promise<ServiceResult<TableMetadata>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.getTableMetadata(home, args);
  const ref: Record<string, string> = { table_id: args.tableId };
  if (args.tableName) ref.table_name = args.tableName;

  const { data, error } = await supabase.rpc("get_full_table", {
    ref: ref as never,
  });
  if (error) {
    // P0002 is the RPC's honest "this dataset is not available to you" — RLS
    // hid the row from a SECURITY INVOKER read, which for a user opening a
    // dataset they can see listed is an ACCESS answer, not a missing one.
    if (error.code === "P0002") {
      return {
        success: false,
        error: recordUnavailable({
          entity: "dataset",
          reason: "unknown",
          recordId: args.tableId,
          token: "dataset",
          relation: "workbench.udt_datasets",
        }).message,
        // NOT "it is gone". It is not in THIS store — and there is a second one.
        // The caller decides what that means (see `whereThisTableLives`).
        code: "dataset_not_here",
      };
    }
    return refused(error);
  }
  try {
    return { success: true, data: parseTableMetadata(data) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load table",
    };
  }
}

/** One row per dataset the user can reach, as returned by `get_user_tables`. */
export type UserTableListItem = {
  id: string;
  table_name: string;
  description: string | null;
  row_count: number;
  field_count: number;
  user_id?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  /**
   * Newest of the dataset's, its rows' and its columns' stamps. The list comes
   * back ordered by this, newest first — a dataset's own `updated_at` does not
   * move when a cell or a column changes.
   */
  last_activity_at?: string;
  /** Which store holds it — `custom.table_list_everywhere` says so; `get_user_tables` does not. */
  store?: "older" | "records";
};

/**
 * The user's dataset list. `get_user_tables` was copy-pasted into eight
 * components before this existed; call this instead of adding a ninth.
 */
export async function listUserTables(): Promise<
  ServiceResult<UserTableListItem[]>
> {
  const { data, error } = await supabase.rpc("get_user_tables");
  if (error) return refused(error);
  if (!isRecord(data) || typeof data.success !== "boolean") {
    return { success: false, error: "Invalid response from get_user_tables" };
  }
  if (!data.success) {
    return {
      success: false,
      error: typeof data.error === "string" ? data.error : "Failed to load tables",
    };
  }
  return {
    success: true,
    data: Array.isArray(data.tables)
      ? (data.tables as unknown as UserTableListItem[])
      : [],
  };
}

export type GetTablePageArgs = {
  tableId: string;
  limit: number;
  offset: number;
  sortField?: string | null;
  sortDirection?: "asc" | "desc";
  searchTerm?: string | null;
};

export type TablePage = {
  rows: { id: string; data: Record<string, unknown> }[];
  pagination: {
    total_count: number;
    page_count: number;
    current_page: number;
  };
};

/**
 * One page of rows. Pair with `getTableMetadata` for the column schema —
 * the paginated RPC deliberately does not carry it.
 */
export async function getTablePage(
  args: GetTablePageArgs,
): Promise<ServiceResult<TablePage>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.getTablePage(home, args);
  const { data, error } = await supabase.rpc(
    "get_user_table_data_paginated_v2",
    {
      p_table_id: args.tableId,
      p_limit: args.limit,
      p_offset: args.offset,
      p_sort_field: args.sortField ?? undefined,
      p_sort_direction: args.sortDirection ?? "asc",
      p_search_term: args.searchTerm ? args.searchTerm : undefined,
    },
  );
  if (error) return refused(error);
  if (!isRecord(data) || typeof data.success !== "boolean") {
    return { success: false, error: "Invalid response from table page RPC" };
  }
  if (!data.success) {
    return {
      success: false,
      error: typeof data.error === "string" ? data.error : "Failed to load data",
    };
  }
  const pagination = isRecord(data.pagination) ? data.pagination : {};
  return {
    success: true,
    data: {
      rows: Array.isArray(data.data)
        ? (data.data as unknown as TablePage["rows"])
        : [],
      pagination: {
        total_count:
          typeof pagination.total_count === "number"
            ? pagination.total_count
            : 0,
        page_count:
          typeof pagination.page_count === "number" ? pagination.page_count : 0,
        current_page:
          typeof pagination.current_page === "number"
            ? pagination.current_page
            : 1,
      },
    },
  };
}

export type CompleteTableField = Record<string, unknown> & {
  id: string;
  field_name: string;
  display_name: string;
};

export type CompleteTableRow = Record<string, unknown> & {
  id: string;
  data: Record<string, unknown>;
};

export type CompleteTable = {
  table: Record<string, unknown>;
  fields: CompleteTableField[];
  rows: CompleteTableRow[];
};

/**
 * Every row plus the complete schema. This intentionally expensive read is
 * reserved for full-table copy/export; metadata and paginated views must use
 * `getTableMetadata` / `getTablePage` instead.
 */
export async function getCompleteTable(args: {
  tableId: string;
  sortField?: string | null;
  sortDirection?: "asc" | "desc";
}): Promise<ServiceResult<CompleteTable>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.getCompleteTable(home, args) as Promise<ServiceResult<CompleteTable>>;
  const { data, error } = await supabase.rpc("get_user_table_complete", {
    p_table_id: args.tableId,
    p_sort_field: args.sortField ?? undefined,
    p_sort_direction: args.sortDirection ?? "asc",
  });
  if (error) return refused(error);
  if (!isRecord(data) || data.success !== true || !isRecord(data.table)) {
    return {
      success: false,
      error:
        isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Invalid response from complete table RPC",
    };
  }

  const fields = Array.isArray(data.fields)
    ? data.fields.filter(
        (field): field is CompleteTableField =>
          isRecord(field) &&
          typeof field.id === "string" &&
          typeof field.field_name === "string" &&
          typeof field.display_name === "string",
      )
    : [];
  const rows = Array.isArray(data.data)
    ? data.data.filter(
        (row): row is CompleteTableRow =>
          isRecord(row) && typeof row.id === "string" && isRecord(row.data),
      )
    : [];

  return { success: true, data: { table: data.table, fields, rows } };
}

// ─── udt_upsert_row ──────────────────────────────────────────────────────────

export type UpsertRowArgs = {
  tableId: string;
  /** Pass `null` (or omit) to insert; pass a row id to update that row. */
  rowId?: string | null;
  data: Record<string, unknown>;
};

export async function upsertRow(
  args: UpsertRowArgs,
): Promise<ServiceResult<DatasetRow>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.upsertRow(home, args);
  // p_row_id is optional in the SQL signature (DEFAULT NULL); omit it to
  // get the insert path, pass it to get the update path.
  const { data, error } = await supabase.rpc("udt_upsert_row", {
    p_table_id: args.tableId,
    ...(args.rowId ? { p_row_id: args.rowId } : {}),
    p_data: args.data as never,
  });
  if (error) return refused(error);
  return { success: true, data: data as unknown as DatasetRow };
}

// ─── udt_upsert_cell ─────────────────────────────────────────────────────────

export type UpsertCellArgs = {
  tableId: string;
  rowId: string;
  fieldName: string;
  value: unknown;
};

export async function upsertCell(
  args: UpsertCellArgs,
): Promise<ServiceResult<DatasetRow>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.upsertCell(home, args);
  const { data, error } = await supabase.rpc("udt_upsert_cell", {
    p_table_id: args.tableId,
    p_row_id: args.rowId,
    p_field_name: args.fieldName,
    p_value: args.value as never,
  });
  if (error) return refused(error);
  return { success: true, data: data as unknown as DatasetRow };
}

// ─── udt_bulk_write ──────────────────────────────────────────────────────────

export type BulkWriteArgs = {
  tableId: string;
  operations: BulkOp[];
};

/**
 * Atomicity contract: the entire batch runs in one transaction. Inserts that
 * fail RAISE and abort the whole batch. Update / cell / delete ops that target
 * a non-existent row id "soft fail" — they return `{ error: 'row_not_found' }`
 * in their slot of `results[]` and the rest of the batch still commits.
 *
 * If you need strict all-or-nothing semantics (any miss → rollback), check
 * `results[]` after the call and decide to throw client-side. A `strict: true`
 * option is on the P2 roadmap.
 */
export async function bulkWrite(
  args: BulkWriteArgs,
): Promise<ServiceResult<BulkWriteResponse>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.bulkWrite(home, args);
  const { data, error } = await supabase.rpc("udt_bulk_write", {
    p_table_id: args.tableId,
    p_operations: args.operations as never,
  });
  if (error) return refused(error);
  return { success: true, data: data as unknown as BulkWriteResponse };
}

// ─── udt_change_field_type ───────────────────────────────────────────────────

export type ChangeFieldTypeArgs = {
  tableId: string;
  fieldId: string;
  newType: FieldDataType;
  /** Default 'cast_or_null'. */
  strategy?: ChangeFieldTypeStrategy;
};

/**
 * Walks every row that has this field and rewrites the JSONB cell to the new
 * type (cast where possible; un-castable values become null or stay put per
 * strategy). Rows where the field is absent are skipped — no audit entry, no
 * realtime fanout. Then flips `udt_dataset_fields.data_type`.
 *
 * NOTE: validation triggers fire per-row using the OLD field type (the field's
 * data_type flips AFTER the row rewrite). For strict-mode datasets this means
 * the rewritten values must satisfy the *old* type's checks first. For
 * permissive mode (the default) this is a non-issue.
 */
export async function changeFieldType(
  args: ChangeFieldTypeArgs,
): Promise<ServiceResult<ChangeFieldTypeResponse>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.changeFieldType(home, args) as Promise<ServiceResult<ChangeFieldTypeResponse>>;
  const { data, error } = await supabase.rpc("udt_change_field_type", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
    p_new_type: args.newType,
    p_strategy: args.strategy ?? "cast_or_null",
  });
  if (error) return refused(error);
  return { success: true, data: data as unknown as ChangeFieldTypeResponse };
}

// ─── udt_delete_field ────────────────────────────────────────────────────────

export type DeleteFieldArgs = {
  tableId: string;
  fieldId: string;
};

export type DeleteFieldResponse = {
  table_id: string;
  field_id: string;
  field_name: string;
  display_name: string;
  /** How many rows carried a value for this column and were rewritten. */
  rows_cleared: number;
};

/**
 * Removes a column and purges its key from every row.
 *
 * THE ONE delete-column path. Before this existed a user could add columns
 * forever and never remove one — the original `remove_column_from_user_table`
 * was dropped without a replacement. Every surface that lets a user manage
 * columns (TableConfigModal, the column header menu) must call this rather
 * than deleting the field row directly, because the orphaned JSONB key would
 * otherwise resurrect itself the moment a column of the same name is re-added.
 *
 * Refuses to remove the last remaining column. Cleared values remain in
 * `udt_dataset_row_versions` history.
 */
export async function deleteField(
  args: DeleteFieldArgs,
): Promise<ServiceResult<DeleteFieldResponse>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.deleteField(home, args);
  const { data, error } = await supabase.rpc("udt_delete_field", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
  });
  if (error) return refused(error);

  const envelope = data as unknown as
    | ({ success?: boolean; error?: string } & Partial<DeleteFieldResponse>)
    | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to delete column" };
  }
  return { success: true, data: envelope as DeleteFieldResponse };
}

// ─── udt_set_field_format ────────────────────────────────────────────────────

export type SetFieldFormatArgs = {
  tableId: string;
  fieldId: string;
  /** Pass `null` to clear the format and fall back to the storage type. */
  format: FieldFormatConfig | null;
};

/**
 * Writes a column's display format to `udt_dataset_fields.metadata.format`.
 *
 * Purely additive: `data_type` and every stored value are untouched, so a
 * format can be set, changed, or cleared with zero risk to the data. See
 * `lib/field-formats/FEATURE.md`.
 */
export async function setFieldFormat(
  args: SetFieldFormatArgs,
): Promise<ServiceResult<{ field_id: string }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.setFieldFormat(home, args);
  const { data, error } = await supabase.rpc("udt_set_field_format", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
    p_format: (args.format ?? null) as never,
  });
  if (error) return refused(error);

  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    field_id?: string;
  } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to save format" };
  }

  // An Autonumber column numbers NEW rows by itself (trigger `_udt_autonumber`,
  // migrations/udt_autonumber_column.sql). The rows that existed before the
  // column became one are numbered here, once, oldest first — on EVERY path
  // that sets the format (new-column form, Table Settings), because it lives
  // in the one wrapper they share. Idempotent; a failure is reported, never
  // swallowed, since the column would otherwise sit half-numbered in silence.
  if (args.format?.id === "autonumber") {
    const backfill = await backfillAutonumber({
      tableId: args.tableId,
      fieldId: args.fieldId,
    });
    if (!backfill.success) {
      return {
        success: false,
        error: `The column was set to Autonumber, but the existing rows could not be numbered: ${backfill.error}`,
      };
    }
  }
  return { success: true, data: { field_id: envelope.field_id ?? args.fieldId } };
}

/** Number the existing rows of an Autonumber column. Idempotent. */
export async function backfillAutonumber(args: {
  tableId: string;
  fieldId: string;
}): Promise<ServiceResult<{ numbered: number; highest: number }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.backfillAutonumber(home, args);
  const { data, error } = await supabase.rpc("udt_backfill_autonumber", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
  });
  if (error) return refused(error);
  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    numbered?: number;
    highest?: number;
  } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to number the existing rows" };
  }
  return {
    success: true,
    data: { numbered: envelope.numbered ?? 0, highest: envelope.highest ?? 0 },
  };
}

// ─── rename a column (display name) ──────────────────────────────────────────

/** The slice of a field row `renameColumn` needs. */
export type RenameColumnField = {
  id: string;
  field_name: string;
  display_name: string;
  metadata?: unknown;
};

/**
 * After a column's header changed from `from` to `to`, rewrite `{from}` →
 * `{to}` in every OTHER formula column and save it. The ONE place this
 * happens — the header's inline rename and Table Settings both call it, so a
 * rename can never turn a working formula into #ERROR on one path only.
 * `fields[].metadata.format` must be the format as it NOW stands (Table
 * Settings passes its unsaved format edits merged in).
 */
export async function rewriteFormulasForRename(args: {
  tableId: string;
  fields: readonly RenameColumnField[];
  renamedFieldId: string;
  from: string;
  to: string;
}): Promise<{ formulasUpdated: string[]; formulasFailed: string[] }> {
  const formulasUpdated: string[] = [];
  const formulasFailed: string[] = [];
  for (const other of args.fields) {
    if (other.id === args.renamedFieldId) continue;
    const format = (other.metadata as { format?: FieldFormatConfig } | null | undefined)?.format;
    if (!format || format.id !== "formula") continue;
    const expression = format.options?.formula?.expression ?? "";
    const rewritten = rewriteFormulaReferences(expression, args.from, args.to);
    if (rewritten === expression) continue;
    const result = await setFieldFormat({
      tableId: args.tableId,
      fieldId: other.id,
      format: {
        ...format,
        options: {
          ...(format.options ?? {}),
          formula: { ...(format.options?.formula ?? { expression }), expression: rewritten },
        },
      },
    });
    (result.success ? formulasUpdated : formulasFailed).push(other.display_name);
  }
  return { formulasUpdated, formulasFailed };
}

/**
 * Rename ONE column's header (its `display_name`; the machine `field_name`
 * never changes, so stored rows, filters, colors and saved views are
 * untouched) and keep every FORMULA that referred to the old header working
 * by rewriting `{Old name}` → `{New name}` in it.
 *
 * Same write path Table Settings uses (`update_user_table_config` for the
 * name, `udt_set_field_format` for a formula's expression) — no new door. The
 * name is written first; a formula that then fails to update is REPORTED in
 * `formulasFailed` (it would show #ERROR naming the old header) rather than
 * rolled into a generic failure, because the rename itself did happen.
 */
export async function renameColumn(args: {
  tableId: string;
  field: RenameColumnField;
  newName: string;
  /** Every column of the table, so dependent formulas can be found. */
  fields: readonly RenameColumnField[];
}): Promise<
  ServiceResult<{ formulasUpdated: string[]; formulasFailed: string[] }>
> {
  const newName = args.newName.trim();
  if (!newName) return { success: false, error: "A column needs a name." };
  if (newName === args.field.display_name) {
    return { success: true, data: { formulasUpdated: [], formulasFailed: [] } };
  }
  const clash = args.fields.find(
    (f) =>
      f.id !== args.field.id &&
      (f.display_name.trim().toLowerCase() === newName.toLowerCase() ||
        f.field_name.toLowerCase() === newName.toLowerCase()),
  );
  if (clash) {
    return {
      success: false,
      error: `Another column is already called "${clash.display_name}". Column names must be different so formulas and agents can tell them apart.`,
    };
  }

  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.renameColumn(home, { tableId: args.tableId, fieldId: args.field.id, newName });

  const { data, error } = await supabase.rpc("update_user_table_config", {
    p_table_id: args.tableId,
    p_field_updates: [{ id: args.field.id, display_name: newName }] as never,
  });
  if (error) return refused(error);
  const envelope = data as unknown as { success?: boolean; error?: string } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to rename the column" };
  }

  const { formulasUpdated, formulasFailed } = await rewriteFormulasForRename({
    tableId: args.tableId,
    fields: args.fields,
    renamedFieldId: args.field.id,
    from: args.field.display_name,
    to: newName,
  });
  return { success: true, data: { formulasUpdated, formulasFailed } };
}

// ─── udt_set_table_style ─────────────────────────────────────────────────────

export type SetTableStyleArgs = {
  tableId: string;
  /** One of the `stylePath.*` builders in `table-style.ts`. */
  path: readonly string[];
  /** `null` deletes the key. */
  value: unknown;
};

/**
 * Write ONE path of the table's color style (`metadata.style`). Surgical by
 * design — see `table-style.ts` and the migration `udt_table_style_and_example_tables`.
 */
export async function setTableStyle(
  args: SetTableStyleArgs,
): Promise<ServiceResult<{ style: unknown }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.setTableStyle(home, args);
  const { data, error } = await supabase.rpc("udt_set_table_style", {
    p_table_id: args.tableId,
    p_path: [...args.path],
    p_value: (args.value ?? null) as never,
  });
  if (error) return refused(error);
  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    style?: unknown;
  } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to save colors" };
  }
  return { success: true, data: { style: envelope.style } };
}

// ─── update_user_table_config (field_order only) ─────────────────────────────

/**
 * Renumber columns — the second half of "insert column left / right". The new
 * column is created AT the target order by `add_column_to_user_table`; this
 * shifts every column that already held that order or a later one by +1, so
 * two columns never share a slot. `update_user_table_config` is the existing
 * column-editing RPC (Table Settings uses it); only `field_order` is sent.
 */
export async function renumberFields(args: {
  tableId: string;
  updates: { id: string; field_order: number }[];
}): Promise<ServiceResult<{ updated: number }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.renumberFields(home, args);
  if (args.updates.length === 0) return { success: true, data: { updated: 0 } };
  const { data, error } = await supabase.rpc("update_user_table_config", {
    p_table_id: args.tableId,
    p_field_updates: args.updates as never,
  });
  if (error) return refused(error);
  const envelope = data as unknown as { success?: boolean; error?: string } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to reorder columns" };
  }
  return { success: true, data: { updated: args.updates.length } };
}

// ─── udt_list_example_tables ─────────────────────────────────────────────────

/**
 * The platform's EXAMPLE tables — datasets owned by the Matrx System org,
 * readable by every signed-in user (RLS decides; the RPC is SECURITY
 * INVOKER). Distinct from `listUserTables`, which stays "my own tables".
 */
export async function listExampleTables(): Promise<
  ServiceResult<UserTableListItem[]>
> {
  const { data, error } = await supabase.rpc("udt_list_example_tables");
  if (error) return refused(error);
  if (!isRecord(data) || data.success !== true) {
    return { success: false, error: "Invalid response from udt_list_example_tables" };
  }
  return {
    success: true,
    data: Array.isArray(data.tables)
      ? (data.tables as unknown as UserTableListItem[])
      : [],
  };
}

// ─── update_user_table_metadata ──────────────────────────────────────────────

export type UpdateTableMetadataArgs = {
  tableId: string;
  /** Omit to leave unchanged. */
  tableName?: string;
  /** Omit to leave unchanged. */
  description?: string;
  /** Omit to leave unchanged. */
  isPublic?: boolean;
};

export type UpdatedTableMetadata = {
  id: string;
  table_name: string;
  description: string | null;
  version: number | null;
  is_public: boolean | null;
  updated_at: string;
};

/**
 * Typed wrapper for the pre-existing `update_user_table_metadata` RPC — the
 * table-level metadata twin of `upsertCell`.
 *
 * THE COALESCE CONTRACT, and why it matters: every argument except the id is
 * `COALESCE(p_x, x)` server-side, so an OMITTED field is left alone rather
 * than nulled. That is what makes a description-only write safe — it cannot
 * blank the table's name or flip its visibility as a side effect. Pass only
 * what you intend to change.
 *
 * Requires owner or editor access; the RPC raises 42501 otherwise, which
 * surfaces here as a failure envelope.
 *
 * This is the ONE path for table metadata: `EditTableModal`,
 * `TableConfigModal` and the surface `table_description` write target all go
 * through it, so a UI edit and an agent edit can never disagree.
 */
export async function updateTableMetadata(
  args: UpdateTableMetadataArgs,
): Promise<ServiceResult<UpdatedTableMetadata>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.updateTableMetadata(home, args);
  const { data, error } = await supabase.rpc("update_user_table_metadata", {
    p_table_id: args.tableId,
    ...(args.tableName !== undefined ? { p_table_name: args.tableName } : {}),
    ...(args.description !== undefined
      ? { p_description: args.description }
      : {}),
    ...(args.isPublic !== undefined ? { p_is_public: args.isPublic } : {}),
  });
  if (error) return refused(error);

  // The RPC returns its own {success,error} envelope inside a jsonb payload.
  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    table?: UpdatedTableMetadata;
  } | null;
  if (!envelope || envelope.success !== true || !envelope.table) {
    return {
      success: false,
      error: envelope?.error ?? operationFailed("update this table").message,
    };
  }
  return { success: true, data: envelope.table };
}

// ─── validation_mode ─────────────────────────────────────────────────────────

export type SetValidationModeArgs = {
  tableId: string;
  mode: ValidationMode;
};

/**
 * Flip a dataset between permissive and strict validation.
 *
 * `validation_mode` is NOT carried by `update_user_table_metadata` (its
 * signature predates the column), so this writes the column directly through
 * the standard RLS UPDATE path on `workbench.udt_datasets` — owner OR editor.
 * Strict mode is what arms the server-side write trigger added in
 * `migrations/udt_v2_backbone.sql`; enforcement has shipped since then, and
 * until this service existed the ONLY way to arm it was raw SQL.
 *
 * The `.select()` is load-bearing: an RLS refusal on UPDATE is a zero-row
 * result, not an error, and reporting "Saved" on a write that touched nothing
 * is exactly the silent lie the governance-column doctrine forbids.
 */
export async function setValidationMode(
  args: SetValidationModeArgs,
): Promise<ServiceResult<{ validation_mode: ValidationMode }>> {
  if (recordStoreHomeOf(args.tableId)) {
    // Not a gap: every write to a record-store table is judged by its columns'
    // rules, so it is strict by construction and there is nothing to switch.
    return {
      success: false,
      error: "This table lives in the record store, where every change is checked against the column's rules. It is always strict, so there is no switch to turn.",
    };
  }
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_datasets")
    .update({ validation_mode: args.mode })
    .eq("id", args.tableId)
    .select("id, validation_mode")
    .maybeSingle();

  if (error) return refused(error);
  if (!data) {
    return {
      success: false,
      error:
        "Validation mode was not saved — this table is no longer available to you, or you do not have edit access to it.",
    };
  }
  return {
    success: true,
    data: {
      validation_mode:
        data.validation_mode === "strict" ? "strict" : "permissive",
    },
  };
}

// ─── udt_column_facets / udt_table_profile ───────────────────────────────────
//
// THE COLUMN KNOWS ITSELF — read `features/data-tables/FEATURE.md` § Column
// shape before adding another "count the distinct values" path.
//
// These replace counting in the browser. The viewer used to pull up to 5,000
// rows down to filter client-side, and past that cap it answered confidently
// over a partial set. Distinct values, counts and fill rates are computed in
// the database over EVERY row, or the call fails — there is no partial answer.

export type GetColumnFacetsArgs = {
  tableId: string;
  /** MACHINE field name. A display name is refused by the RPC, not guessed. */
  fieldName: string;
  /** Max distinct values returned (server clamps to 1..500). Default 50. */
  limit?: number;
  /** Active global search, so facets describe the rows the user can see. */
  searchTerm?: string | null;
};

/**
 * Distinct values + counts for one column.
 *
 * Refusals are meaningful and must not be flattened: a field name that is not a
 * column raises (never an empty list, which reads as "the column is empty"),
 * and an unreachable dataset raises P0002 — the genuinely ambiguous
 * deleted/denied/missing case that belongs to AccessGate, not to an error toast.
 */
export async function getColumnFacets(
  args: GetColumnFacetsArgs,
): Promise<ServiceResult<ColumnFacets>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.getColumnFacets(home, args);
  const { data, error } = await supabase.rpc("udt_column_facets", {
    p_table_id: args.tableId,
    p_field_name: args.fieldName,
    p_limit: args.limit ?? 50,
    p_search_term: args.searchTerm ?? undefined,
  });

  if (error) {
    // Same P0002 contract as `getTableMetadata`: an unreachable dataset is an
    // ACCESS answer for AccessGate to resolve, never a "column not found".
    if (error.code === "P0002") {
      return {
        success: false,
        error: recordUnavailable({
          entity: "dataset",
          reason: "unknown",
          recordId: args.tableId,
          token: "dataset",
          relation: "workbench.udt_datasets",
        }).message,
      };
    }
    return refused(error);
  }
  if (!isRecord(data) || data.success !== true) {
    return {
      success: false,
      error: "udt_column_facets returned an unexpected envelope",
    };
  }
  return { success: true, data: data as unknown as ColumnFacets };
}

export type GetTableProfileArgs = {
  tableId: string;
  /** Top values kept per column (server clamps to 1..100). Default 12. */
  previewValues?: number;
};

/**
 * The shape of every column in one call — fill rate, distinct count, type
 * evidence, top values. One round trip, never one request per column.
 */
export async function getTableProfile(
  args: GetTableProfileArgs,
): Promise<ServiceResult<TableProfile>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.getTableProfile(home, args) as Promise<ServiceResult<TableProfile>>;
  const { data, error } = await supabase.rpc("udt_table_profile", {
    p_table_id: args.tableId,
    p_preview_values: args.previewValues ?? 12,
  });

  if (error) {
    // Same P0002 contract as `getTableMetadata`: an unreachable dataset is an
    // ACCESS answer for AccessGate to resolve, never a "column not found".
    if (error.code === "P0002") {
      return {
        success: false,
        error: recordUnavailable({
          entity: "dataset",
          reason: "unknown",
          recordId: args.tableId,
          token: "dataset",
          relation: "workbench.udt_datasets",
        }).message,
      };
    }
    return refused(error);
  }
  if (!isRecord(data) || data.success !== true) {
    return {
      success: false,
      error: "udt_table_profile returned an unexpected envelope",
    };
  }
  return { success: true, data: data as unknown as TableProfile };
}

// ─── udt_set_table_row_label ─────────────────────────────────────────────────

/**
 * Set or clear the table's ROW LABEL — the value that names a row wherever the
 * row is referred to (`features/data-tables/row-label.ts`). `null` clears it
 * and the readers fall back to the first ordinary column.
 */
export async function setTableRowLabel(args: {
  tableId: string;
  rowLabel: import("./row-label").RowLabelConfig | null;
}): Promise<ServiceResult<{ row_label: unknown }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.setTableRowLabel(home, args);
  const { data, error } = await supabase.rpc("udt_set_table_row_label", {
    p_table_id: args.tableId,
    p_row_label: (args.rowLabel ?? null) as never,
  });
  if (error) return refused(error);
  const envelope = data as unknown as { success?: boolean; error?: string; row_label?: unknown } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to save the row label" };
  }
  return { success: true, data: { row_label: envelope.row_label ?? null } };
}

/**
 * Replace the table's ROW ACTIONS — the one-click buttons on a row
 * (`features/data-tables/row-actions.ts`). An empty list clears them.
 */
export async function setTableRowActions(args: {
  tableId: string;
  rowActions: import("./row-actions").RowAction[];
}): Promise<ServiceResult<{ row_actions: unknown }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.setTableRowActions(home, args as { tableId: string; rowActions: Record<string, unknown>[] });
  const { data, error } = await supabase.rpc("udt_set_table_row_actions", {
    p_table_id: args.tableId,
    p_row_actions: args.rowActions as never,
  });
  if (error) return refused(error);
  const envelope = data as unknown as { success?: boolean; error?: string; row_actions?: unknown } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to save the row actions" };
  }
  return { success: true, data: { row_actions: envelope.row_actions ?? [] } };
}

// ─── the doors the grid used to call inline (lane GRID-PORT) ─────────────────
//
// Until the seam, `UserTableViewer` and three modals called these doors with
// `supabase.rpc` directly, which is exactly the path a record-store table must
// never take. They live here now so they dispatch like everything above; the
// older bodies are the inline code, moved, unchanged.

/** The dialogs' own envelope check (`unwrapUserTableMutation`), with its exact sentences. */
function mutationFailure(data: unknown): ServiceErr | null {
  try {
    unwrapUserTableMutation((data ?? null) as never);
    return null;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

function envelopeFailure(data: unknown, fallback: string): ServiceErr | null {
  if (!isRecord(data) || typeof data.success !== "boolean") {
    return { success: false, error: "Invalid table RPC response" };
  }
  if (!data.success) {
    return { success: false, error: typeof data.error === "string" && data.error ? data.error : fallback };
  }
  return null;
}

/**
 * May the signed-in person EDIT this table? The owner never asks (the viewer
 * knows ownership from the table row); a shared editor is answered by the
 * store: `has_permission` for an older table, `custom.my_levels` for a
 * record-store table.
 */
export async function hasEditorAccess(args: { tableId: string }): Promise<boolean> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.hasEditorAccess(home, args);
  const { data } = await supabase.rpc("has_permission", {
    p_resource_type: "dataset",
    p_resource_id: args.tableId,
    p_required_permission: "editor",
  });
  return data === true;
}

/** Turn manual row ordering on with this order, or off (`enabled: false`, empty order). */
export async function setRowOrdering(args: {
  tableId: string;
  enabled: boolean;
  order: string[];
}): Promise<ServiceResult<null>> {
  if (recordStoreHomeOf(args.tableId)) return notOnTheRecordStoreYet("keep a hand-made row order");
  const { data, error } = await supabase.rpc("update_user_table_row_ordering", {
    p_table_id: args.tableId,
    p_enabled: args.enabled,
    p_order: args.order,
  });
  if (error) return refused(error);
  const failed = envelopeFailure(
    data,
    args.enabled ? "Failed to update row order" : "Failed to disable row ordering",
  );
  return failed ?? { success: true, data: null };
}

/** Save (or, with no field, clear) the table's default sort. */
export async function setDefaultSort(args: {
  tableId: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}): Promise<ServiceResult<null>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.setDefaultSort(home, args);
  const { data, error } = await supabase.rpc("update_user_table_default_sort", {
    p_table_id: args.tableId,
    p_sort_field: args.sortField,
    ...(args.sortField ? { p_sort_direction: args.sortDirection } : {}),
  });
  if (error) return refused(error);
  const failed = envelopeFailure(
    data,
    args.sortField ? "Failed to save sort preference" : "Failed to clear sort preference",
  );
  return failed ?? { success: true, data: null };
}

/** Delete (older store) or archive (record store) one row. */
export async function deleteRow(args: {
  tableId: string;
  rowId: string;
}): Promise<ServiceResult<unknown>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.deleteRow(home, args);
  const { data, error } = await supabase.rpc("delete_data_row_from_user_table", {
    p_row_id: args.rowId,
  });
  if (error) return refused(error);
  const failed = mutationFailure(data);
  return failed ?? { success: true, data: data ?? null };
}

/**
 * The words the relation cells of `rowIds` read in `fieldName` of a RECORD-STORE table
 * (`custom.relation_words_many`, the grid's own door). An older table's words come from its
 * own door (`udt_row_words_many`); this export answers an empty map for it, never a guess.
 */
export async function readRelationWords(args: {
  tableId: string;
  fieldName: string;
  rowIds: readonly string[];
}): Promise<Map<string, string>> {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return new Map();
  return recordStore.relationWords(home, args);
}

/**
 * EVERY TABLE A "SAVE INTO A TABLE" PICKER MAY OFFER (lane INTEG-CLIENTS, CUTOVER-PLAN F1).
 * The person's older tables AND the active organization's record-store Tables, one list,
 * de-duplicated by id (a moved table keeps its id, and its archived older copy is not in
 * `get_user_tables`). Picking a store table works because the save paths `locateTable`
 * before they write.
 */
export async function listTablesEverywhere(args: { organizationId?: string | null } = {}): Promise<
  ServiceResult<UserTableListItem[]>
> {
  let organizationId: string;
  try {
    organizationId = await ensureOrgId(args.organizationId ?? null);
  } catch {
    return listUserTables();
  }
  // THE ONE LIST, from the database (GRID-PRIMITIVES G9): `custom.table_list_everywhere` answers
  // `get_user_tables`' shape for BOTH stores — this person's live older datasets in this
  // organization plus every Table here they may open, each with its real row count and `store`.
  const everywhere = await (supabase as unknown as SupabaseClient)
    .schema("custom")
    .rpc("table_list_everywhere", { p_organization_id: organizationId });
  if (!everywhere.error) {
    const payload = everywhere.data as { success?: boolean; tables?: unknown } | null;
    return { success: true, data: Array.isArray(payload?.tables) ? (payload.tables as UserTableListItem[]) : [] };
  }
  if (!DOOR_ABSENT.has(everywhere.error.code ?? "")) return refused(everywhere.error);

  // DOOR NOT ON THIS DATABASE YET (G9 reaches production in the 2026-09-24 window). The same
  // answer composed here — the older list plus the store's Tables with their counts — so no
  // picker loses a moved table meanwhile. Retire this arm once the door is everywhere.
  console.warn("[data-tables] custom.table_list_everywhere is not on this database yet; composing the list from both stores.");
  const older = await listUserTables();
  const { data: session } = await supabase.auth.getSession();
  const store = await recordStore.listTables({
    store: "record",
    organizationId,
    userId: session.session?.user?.id ?? null,
  });
  if (!store.success) {
    console.warn(`[data-tables] The record store's tables could not be listed, so only older tables are offered: ${store.error}`);
    return older;
  }
  const seen = new Set<string>();
  const merged: UserTableListItem[] = [];
  for (const t of [...store.data, ...(older.success ? older.data : [])]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t as UserTableListItem);
  }
  return { success: true, data: merged };
}

/** PostgREST / Postgres codes for "that function is not on this database". */
const DOOR_ABSENT = new Set(["PGRST202", "42883"]);

/**
 * The tables a header's switcher lists while `tableId` is open. An older table
 * lists the person's older tables, as it always did; a record-store table lists
 * those AND its organization's record-store Tables, because both open here now.
 */
export async function listTablesBeside(args: {
  tableId: string;
}): Promise<ServiceResult<UserTableListItem[]>> {
  const older = await listUserTables();
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return older;
  const store = await recordStore.listTables(home);
  if (!store.success) return older.success ? older : store;
  const seen = new Set<string>();
  const merged: UserTableListItem[] = [];
  for (const t of [...store.data, ...(older.success ? older.data : [])]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t as UserTableListItem);
  }
  return { success: true, data: merged };
}

/**
 * Every row, for the grid's client-side sort of a small table. The older half
 * is the FIRST paginated door (`get_user_table_data_paginated`), which the
 * viewer's type-aware sort has always read — kept, so an older table sorts
 * exactly as it did. A record-store table answers from the same read as a page.
 */
export async function getRowsForClientSort(args: {
  tableId: string;
  limit: number;
}): Promise<ServiceResult<TablePage["rows"]>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) {
    const page = await recordStore.getTablePage(home, { tableId: args.tableId, limit: args.limit, offset: 0 });
    return page.success ? { success: true, data: page.data.rows } : page;
  }
  const { data, error } = await supabase.rpc("get_user_table_data_paginated", {
    p_table_id: args.tableId,
    p_limit: args.limit,
    p_offset: 0,
    p_sort_field: undefined,
    p_sort_direction: "asc",
    p_search_term: undefined,
  });
  if (error) return refused(error);
  const failed = envelopeFailure(data, "Failed to load data");
  if (failed) return failed;
  const rows = (data as { data?: unknown }).data;
  return { success: true, data: Array.isArray(rows) ? (rows as TablePage["rows"]) : [] };
}

/**
 * TRUE when the table is read and written through the record store. For the
 * few places where the grid does something ITSELF that the store now does —
 * working out a formula, running a row action's steps — so the grid asks
 * rather than computing in the browser.
 */
export function isRecordStoreTable(tableId: string | null | undefined): boolean {
  return recordStoreHomeOf(tableId) !== null;
}

/**
 * Run an update row action over a selection. Record store only: the store runs
 * the whole selection in one transaction and works every formula step out
 * itself (G2). An older table keeps running its steps in the grid, as before.
 */
export async function runRowAction(args: {
  tableId: string;
  actionId: string;
  rowIds: readonly string[];
}): Promise<ServiceResult<{ changed: number }>> {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) {
    return { success: false, error: "An older table runs its row actions in the grid; this door is the record store's." };
  }
  return recordStore.runRowAction(home, args);
}

/** Exactly these rows, read again from the table's store (after a write the store did itself). */
export async function readRowsById(args: {
  tableId: string;
  rowIds: readonly string[];
}): Promise<ServiceResult<TablePage["rows"]>> {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) {
    return { success: false, error: "An older table's rows are read a page at a time; this door is the record store's." };
  }
  return recordStore.rowsById(home, args);
}

// ─── history (lane GRID-PORT) ───────────────────────────────────────────────
//
// An older row's history is read by `hooks/useRowVersions.ts` straight from
// `udt_dataset_row_versions` and restored by writing the snapshot back
// (`upsertRow` / `upsertCell`), exactly as before. A record-store row's history
// is the store's own (`custom.record_history`), rebuilt into the same shape, and
// restored by the store's own verbs — never by writing a snapshot over it.

export async function readRowHistory(args: {
  tableId: string;
  rowId: string;
  limit: number;
}): Promise<ServiceResult<import("./types").RowVersion[]>> {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return { success: false, error: "An older row's history is read by useRowVersions." };
  const read = await recordStore.rowHistory(home, args);
  return read.success ? { success: true, data: read.data as unknown as import("./types").RowVersion[] } : read;
}

export async function restoreRowVersion(args: { tableId: string; rowId: string; version: number }) {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return { success: false, error: "An older row is restored by writing its snapshot back." } as ServiceErr;
  return recordStore.restoreRowVersion(home, args);
}

export async function revertRowField(args: { tableId: string; rowId: string; fieldName: string; version: number }) {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return { success: false, error: "An older row's cell is reverted by writing it back." } as ServiceErr;
  return recordStore.revertRowField(home, args);
}

export async function restoreArchivedRow(args: { tableId: string; rowId: string }) {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return { success: false, error: "An older row that was deleted is re-inserted from its snapshot." } as ServiceErr;
  return recordStore.restoreArchivedRow(home, args);
}

/**
 * The table-and-column settings write the settings dialogs send
 * (`update_user_table_config`: a table's name and description, a column's
 * name, position, required mark and rules). A record-store table sends each
 * column's change through `custom.field_update` and the table's through its
 * own record.
 */
export async function updateTableConfig(args: {
  tableId: string;
  tableUpdates?: Record<string, unknown>;
  fieldUpdates?: Array<Record<string, unknown> & { id: string }>;
}): Promise<ServiceResult<null>> {
  const home = recordStoreHomeOf(args.tableId);
  if (home) return recordStore.updateTableConfig(home, args);
  const params: Record<string, unknown> = { p_table_id: args.tableId };
  if (args.tableUpdates && Object.keys(args.tableUpdates).length > 0) params.p_table_updates = args.tableUpdates;
  if (args.fieldUpdates && args.fieldUpdates.length > 0) params.p_field_updates = args.fieldUpdates;
  const { data, error } = await supabase.rpc("update_user_table_config", params as never);
  if (error) return refused(error);
  const failed = mutationFailure(data);
  return failed ?? { success: true, data: null };
}

// ─── the Add Column / Add Row forms (lane GRID-PORT) ────────────────────────
//
// Both forms call `utils/user-table-utls/table-utils` for an older table, as
// they always did; a record-store table goes to the store's own doors
// (`custom.field_declare`, `custom.record_write`).

export async function addTableColumn(
  params: AddColumnParams,
): Promise<AddColumnResult> {
  const home = recordStoreHomeOf(params.tableId);
  if (home) return recordStore.addColumn(home, params);
  return addColumnToOlderTable(supabase, params);
}

/**
 * MAKE A NEW TABLE, OUTSIDE THE GRID (lane INTEG-CLIENTS, CUTOVER-PLAN F4/F5). The ONE
 * birth every "save this as a table" caller uses — a chat answer, a CSV or JSON block, a
 * canvas table, a page extraction, the zip heatmap, the ts-function registry. It asks where
 * this organization's tables live (`whereANewTableIsBorn`): a moved organization's table is
 * born in the record store and PLACED there, so the caller's next `bulkWrite` /
 * `addTableRow` / `addTableColumn` / `readTableDetails` on the new id reaches the store; an
 * unmoved organization's table is born in the older store exactly as before. Same result
 * shape either way — `{ success, tableId, error }` — so no caller changes what it reads.
 */
export async function createTable(params: CreateTableParams): Promise<CreateTableResult> {
  if (!params.tableName.trim()) return { success: false, error: "Table name is required" };
  let born: Awaited<ReturnType<typeof whereANewTableIsBorn>>;
  try {
    born = await whereANewTableIsBorn(params.organizationId ?? null);
  } catch (err) {
    // `ensureOrgId` throws when the person closes the organization picker — a decision.
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!born.ok) return { success: false, error: born.error };
  if (born.store === "older") {
    return createOlderTable(supabase, { ...params, organizationId: born.organizationId });
  }
  const made = await recordStore.createTable(born.home, {
    tableName: params.tableName.trim(),
    description: params.description,
    // The SAME sanitizing the older door's caller contract promises (`createTable` in
    // table-utils): callers key their rows by `sanitizeFieldName(header)`.
    fields: (params.fields ?? []).map((f) => ({
      field_name: sanitizeFieldName(f.field_name),
      display_name: f.display_name,
      data_type: f.data_type,
      field_order: f.field_order,
      is_required: f.is_required,
    })),
  });
  if (!made.success || !made.tableId) return { success: false, error: made.error ?? "The table was not created." };
  placeTableInRecordStore(made.tableId, { organizationId: born.home.organizationId, userId: born.home.userId });
  if (made.warning) console.warn(`[data-tables] ${made.warning}`);
  return { success: true, tableId: made.tableId };
}

export async function readTableDetails(tableId: string): Promise<GetTableResult> {
  const home = recordStoreHomeOf(tableId);
  if (home) return recordStore.tableDetails(home, tableId) as Promise<GetTableResult>;
  return getOlderTableDetails(supabase, tableId);
}

export async function addTableRow(params: { tableId: string; data: Record<string, unknown> }): Promise<{
  success: boolean;
  rowId?: string;
  error?: string;
}> {
  const home = recordStoreHomeOf(params.tableId);
  if (home) {
    const made = await recordStore.upsertRow(home, { tableId: params.tableId, data: params.data });
    return made.success ? { success: true, rowId: made.data.id } : { success: false, error: made.error };
  }
  return addRowToOlderTable(supabase, params);
}

/**
 * "When a row changes, run an agent…" for this table: which changes a schedule may listen
 * for, or `null` when a schedule on it would never fire. An older table always answers
 * (its row trigger feeds the scheduler); a record-store table answers only once G8 and
 * `custom.record_change_actions` are on the database (lane GRID-PORT F4).
 */
export async function rowChangeScheduleFor(args: {
  tableId: string;
}): Promise<{ entityType: string; actions: Array<{ value: string; label: string }> } | null> {
  const home = recordStoreHomeOf(args.tableId);
  if (!home) return { entityType: "user_table_row", actions: [] };
  const answer = await recordChangeActions(home, args.tableId);
  if (!answer.ok) return null;
  return { entityType: recordChangeTrigger(args.tableId).entity_type, actions: answer.data.actions };
}

