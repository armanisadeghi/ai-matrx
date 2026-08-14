/**
 * Domain types for the data-tables (UDT) system.
 *
 * Everything here is derived from the generated Supabase types
 * (`types/database.types.ts`). Do not define ad-hoc shapes for `udt_*`
 * tables/columns elsewhere — extend this file.
 */
import type { Database } from "@/types/database.types";

type T = Database["workbench"]["Tables"];
type E = Database["public"]["Enums"];

// ─── Row shapes (from Supabase) ──────────────────────────────────────────────

export type Workbook = T["udt_workbooks"]["Row"];
export type WorkbookInsert = T["udt_workbooks"]["Insert"];
export type WorkbookUpdate = T["udt_workbooks"]["Update"];

export type WorkbookSnapshot = T["udt_workbook_snapshots"]["Row"];
export type WorkbookSnapshotInsert = T["udt_workbook_snapshots"]["Insert"];

/** Origin of a snapshot. Free text in the DB; this enum is advisory. */
export type WorkbookSnapshotOrigin =
  | "autosave"
  | "manual"
  | "imported"
  | "restored";

// ─── documents (mirror of workbooks; Univer preset-docs-core surface) ────────

export type DocumentRow = T["udt_documents"]["Row"];
export type DocumentInsert = T["udt_documents"]["Insert"];
export type DocumentUpdate = T["udt_documents"]["Update"];

export type DocumentSnapshot = T["udt_document_snapshots"]["Row"];
export type DocumentSnapshotInsert = T["udt_document_snapshots"]["Insert"];

/** Same advisory enum as workbooks — string column in the DB. */
export type DocumentSnapshotOrigin = WorkbookSnapshotOrigin;

export type Dataset = T["udt_datasets"]["Row"];
export type DatasetInsert = T["udt_datasets"]["Insert"];
export type DatasetUpdate = T["udt_datasets"]["Update"];

export type DatasetField = T["udt_dataset_fields"]["Row"];
export type DatasetFieldInsert = T["udt_dataset_fields"]["Insert"];
export type DatasetFieldUpdate = T["udt_dataset_fields"]["Update"];

export type DatasetRow = T["udt_dataset_rows"]["Row"];
export type DatasetRowInsert = T["udt_dataset_rows"]["Insert"];
export type DatasetRowUpdate = T["udt_dataset_rows"]["Update"];

export type RowVersion = T["udt_dataset_row_versions"]["Row"];

/**
 * The `public.get_full_table(jsonb)` payload — a dataset's schema and size with
 * NO row data. Note the key is `columns`, not `fields`: the row-loading RPC
 * (`get_user_table_complete`) calls the same thing `fields`.
 */
export type TableMetadata = {
  /** Complete `udt_datasets` row (carries row_ordering_config, validation_mode). */
  table: Dataset;
  /** Complete `udt_dataset_fields` rows, ordered by `field_order`. */
  columns: DatasetField[];
  /** Real `COUNT(*)`, not the length of a materialized row array. */
  row_count: number;
};

/**
 * Shape-parse a `get_full_table` payload.
 *
 * Lives here rather than in `service.ts` so callers that bring their own
 * Supabase client (`utils/user-table-utls/table-utils`) can share the one
 * parser without pulling in the browser client singleton.
 *
 * Throws on anything that is not the documented shape — a silently-empty
 * column list is the exact failure this exists to prevent. Note that
 * `get_full_table` has no `{success:false}` envelope either: it RAISES, so a
 * PostgREST error from it means the dataset is missing or its name did not
 * match, never that it has no columns.
 */
export function parseTableMetadata(payload: unknown): TableMetadata {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  if (
    !isRecord(payload) ||
    !isRecord(payload.table) ||
    !Array.isArray(payload.columns) ||
    typeof payload.row_count !== "number"
  ) {
    throw new Error("get_full_table: unexpected response shape");
  }
  return {
    table: payload.table as unknown as Dataset,
    columns: payload.columns as unknown as DatasetField[],
    row_count: payload.row_count,
  };
}

// ─── Enums ───────────────────────────────────────────────────────────────────

export type FieldDataType = E["field_data_type"];
export type RowChangeKind = E["row_change_kind"];
export type WorkbookSource = E["workbook_source"];
export type DocumentSource = E["document_source"];
export type PermissionLevel = E["permission_level"];

export const FIELD_DATA_TYPES: readonly FieldDataType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "json",
  "array",
] as const;

// ─── Bulk-write op shapes (the contract of `udt_bulk_write`) ─────────────────

export type BulkInsertOp = {
  op: "insert";
  data: Record<string, unknown>;
};

export type BulkUpdateOp = {
  op: "update";
  row_id: string;
  /** REPLACES the row's data wholesale. Keys not in `data` are dropped. */
  data: Record<string, unknown>;
};

export type BulkMergeOp = {
  op: "merge";
  row_id: string;
  /**
   * Partial update — `data = existing_data || patch`. Keys in `data` overwrite
   * the row's matching keys; keys absent from `data` are preserved. Use this
   * when sending only changed fields.
   */
  data: Record<string, unknown>;
};

export type BulkCellOp = {
  op: "cell";
  row_id: string;
  field_name: string;
  value: unknown;
};

export type BulkDeleteOp = {
  op: "delete";
  row_id: string;
};

export type BulkOp =
  | BulkInsertOp
  | BulkUpdateOp
  | BulkMergeOp
  | BulkCellOp
  | BulkDeleteOp;

/**
 * Per-op result envelope returned inside `udt_bulk_write.results[]`.
 *
 * Note: insert / update / cell / delete that succeed return the full row.
 * Update / cell / delete against a non-existent row_id return an error
 * envelope (soft failure — the rest of the batch continues). Inserts that
 * fail RAISE and abort the entire batch.
 */
export type BulkOpError = { error: "row_not_found"; row_id: string };
export type BulkOpResult = DatasetRow | BulkOpError;

/**
 * Narrow a bulk-write result slot to the error variant.
 * Successful results carry the full DatasetRow shape (no discriminator key
 * on the success side, so consumers narrow via this guard).
 */
export function isBulkOpError(r: BulkOpResult): r is BulkOpError {
  return typeof r === "object" && r !== null && "error" in r;
}

export type BulkWriteResponse = {
  table_id: string;
  count: number;
  results: BulkOpResult[];
};

// ─── Type-change response ────────────────────────────────────────────────────

export type ChangeFieldTypeStrategy = "cast_or_null" | "cast_or_skip";

export type ChangeFieldTypeResponse = {
  field_id: string;
  new_type: FieldDataType;
  strategy: ChangeFieldTypeStrategy;
  rows_rewritten: number;
  rows_skipped: number;
  rows_total: number;
};

// ─── Validation modes (mirrors the CHECK constraint on udt_datasets) ─────────

export type ValidationMode = "permissive" | "strict";

// ─── Service result envelope (matches existing convention) ───────────────────

export type ServiceOk<T> = { success: true; data: T };
export type ServiceErr = { success: false; error: string };
export type ServiceResult<T> = ServiceOk<T> | ServiceErr;

/**
 * Narrow a ServiceResult to the failure variant. Use instead of `!result.success`
 * inside generic functions where TS's narrow through `Promise<ServiceResult<T>>`
 * sometimes fails to discriminate the union members reliably.
 */
export function isServiceFailure<T>(r: ServiceResult<T>): r is ServiceErr {
  return r.success === false;
}
