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
import { supabase } from "@/utils/supabase/client";

import type { FieldFormatConfig } from "@/lib/field-formats/types";

import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { parseTableMetadata } from "./types";
import type {
  BulkOp,
  BulkWriteResponse,
  ChangeFieldTypeResponse,
  ChangeFieldTypeStrategy,
  ColumnFacets,
  DatasetRow,
  FieldDataType,
  ServiceResult,
  TableMetadata,
  TableProfile,
  ValidationMode,
} from "./types";

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
      };
    }
    return { success: false, error: error.message };
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
};

/**
 * The user's dataset list. `get_user_tables` was copy-pasted into eight
 * components before this existed; call this instead of adding a ninth.
 */
export async function listUserTables(): Promise<
  ServiceResult<UserTableListItem[]>
> {
  const { data, error } = await supabase.rpc("get_user_tables");
  if (error) return { success: false, error: error.message };
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
  if (error) return { success: false, error: error.message };
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
  const { data, error } = await supabase.rpc("get_user_table_complete", {
    p_table_id: args.tableId,
    p_sort_field: args.sortField ?? undefined,
    p_sort_direction: args.sortDirection ?? "asc",
  });
  if (error) return { success: false, error: error.message };
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
  // p_row_id is optional in the SQL signature (DEFAULT NULL); omit it to
  // get the insert path, pass it to get the update path.
  const { data, error } = await supabase.rpc("udt_upsert_row", {
    p_table_id: args.tableId,
    ...(args.rowId ? { p_row_id: args.rowId } : {}),
    p_data: args.data as never,
  });
  if (error) return { success: false, error: error.message };
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
  const { data, error } = await supabase.rpc("udt_upsert_cell", {
    p_table_id: args.tableId,
    p_row_id: args.rowId,
    p_field_name: args.fieldName,
    p_value: args.value as never,
  });
  if (error) return { success: false, error: error.message };
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
  const { data, error } = await supabase.rpc("udt_bulk_write", {
    p_table_id: args.tableId,
    p_operations: args.operations as never,
  });
  if (error) return { success: false, error: error.message };
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
  const { data, error } = await supabase.rpc("udt_change_field_type", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
    p_new_type: args.newType,
    p_strategy: args.strategy ?? "cast_or_null",
  });
  if (error) return { success: false, error: error.message };
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
  const { data, error } = await supabase.rpc("udt_delete_field", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
  });
  if (error) return { success: false, error: error.message };

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
  const { data, error } = await supabase.rpc("udt_set_field_format", {
    p_table_id: args.tableId,
    p_field_id: args.fieldId,
    p_format: (args.format ?? null) as never,
  });
  if (error) return { success: false, error: error.message };

  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    field_id?: string;
  } | null;
  if (!envelope || envelope.success !== true) {
    return { success: false, error: envelope?.error ?? "Failed to save format" };
  }
  return { success: true, data: { field_id: envelope.field_id ?? args.fieldId } };
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
  const { data, error } = await supabase.rpc("update_user_table_metadata", {
    p_table_id: args.tableId,
    ...(args.tableName !== undefined ? { p_table_name: args.tableName } : {}),
    ...(args.description !== undefined
      ? { p_description: args.description }
      : {}),
    ...(args.isPublic !== undefined ? { p_is_public: args.isPublic } : {}),
  });
  if (error) return { success: false, error: error.message };

  // The RPC returns its own {success,error} envelope inside a jsonb payload.
  const envelope = data as unknown as {
    success?: boolean;
    error?: string;
    table?: UpdatedTableMetadata;
  } | null;
  if (!envelope || envelope.success !== true || !envelope.table) {
    return {
      success: false,
      error: envelope?.error ?? "Table not found or update failed",
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
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_datasets")
    .update({ validation_mode: args.mode })
    .eq("id", args.tableId)
    .select("id, validation_mode")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
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
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
  }
  if (!isRecord(data) || data.success !== true) {
    return {
      success: false,
      error: "udt_table_profile returned an unexpected envelope",
    };
  }
  return { success: true, data: data as unknown as TableProfile };
}
