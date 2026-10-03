/**
 * Domain types for the data-tables system: the workbook and document rows (generated Supabase
 * types), and the GRID's shapes — a table, its columns, its rows and a row's versions — which the
 * data seam builds from the record store (`data-source/record-store.ts`). Extend this file rather
 * than defining ad-hoc shapes elsewhere.
 */
import type { RecordsError } from "@ai-matrx/records";
import type { Database, Json } from "@/types/database.types";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

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

// ─── The grid's shapes (built by the data seam from the record store) ────────

/** A table as the grid reads it. */
export type Dataset = {
  id: string;
  table_name: string;
  description: string | null;
  organization_id: string;
  user_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  is_public: boolean;
  metadata: Json;
  custom_fields: Json;
  row_ordering_config: Json | null;
  validation_mode: string;
  version: number;
  project_id: string | null;
  task_id: string | null;
  template_id: string | null;
  template_version: number | null;
  workbook_id: string | null;
  sheet_index: number | null;
  sync_source: Json | null;
  published_to_web: boolean;
  published_to_web_at: string | null;
  published_to_web_by: string | null;
  shown_to: Database["platform"]["Enums"]["shown_to"] | null;
  visibility: Database["platform"]["Enums"]["visibility"];
};

/** A column as the grid draws it. */
export type DatasetField = {
  id: string;
  table_id: string;
  field_name: string;
  display_name: string;
  data_type: FieldDataType;
  field_order: number;
  is_required: boolean;
  is_public: boolean;
  default_value: Json | null;
  validation_rules: Json | null;
  metadata: Json;
  custom_fields: Json;
  organization_id: string;
  user_id: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  version: number;
};

/** A row as the grid holds it. */
export type DatasetRow = {
  id: string;
  table_id: string;
  data: Json;
  metadata: Json;
  custom_fields: Json;
  is_public: boolean;
  organization_id: string;
  user_id: string;
  source_row_ref: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  version: number;
};

/** One version of a row, rebuilt from the store's history (`custom.record_history`). */
export type RowVersion = {
  id: number;
  row_id: string;
  table_id: string;
  change_kind: E["row_change_kind"];
  changed_at: string;
  changed_by: string | null;
  data: Json | null;
  prior_data: Json | null;
  reason: string | null;
  custom_fields: Json;
};

/** A table's schema and size with NO row data. */
export type TableMetadata = {
  /** The table (carries row_ordering_config). */
  table: Dataset;
  /** Its columns, ordered by `field_order`. */
  columns: DatasetField[];
  /** A real count, not the length of a materialized row array. */
  row_count: number;
};

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

// ─── Bulk-write op shapes (the seam's `bulkWrite`) ──────────────────────────

export type BulkInsertOp = {
  op: "insert";
  data: Record<string, unknown>;
};

export type BulkUpdateOp = {
  op: "update";
  row_id: string;
  /** REPLACES the row's data wholesale. Keys not in `data` are dropped. */
  data: Record<string, unknown>;
  /**
   * The version the person saw this row at, when the caller holds it (an undo carries the version its
   * own write produced). Absent = the seam's ledger of the rows it drew (`lib/records/record-versions.ts`).
   */
  expected_version?: number | null;
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
  /**
   * The version the person saw this row at, when the caller holds it (an undo carries the version its
   * own write produced). Absent = the seam's ledger of the rows it drew (`lib/records/record-versions.ts`).
   */
  expected_version?: number | null;
};

export type BulkCellOp = {
  op: "cell";
  row_id: string;
  field_name: string;
  value: unknown;
  /**
   * The version the person saw this row at, when the caller holds it (an undo carries the version its
   * own write produced). Absent = the seam's ledger of the rows it drew (`lib/records/record-versions.ts`).
   */
  expected_version?: number | null;
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
 * Per-op result envelope returned inside `bulkWrite`'s `results[]`.
 *
 * Note: insert / update / cell / delete that succeed return the full row.
 * Update / cell / delete against a row that is gone return `row_not_found`;
 * update / cell / merge against a row that is in Trash return `row_in_trash`
 * (with the server's own sentence in `message`). Both are soft failures — the
 * rest of the batch continues. Inserts that fail RAISE and abort the batch.
 */
export type BulkOpError = {
  error: "row_not_found" | "row_in_trash";
  row_id: string;
  message?: string;
};
export type BulkOpResult = DatasetRow | BulkOpError;

/**
 * Narrow a bulk-write result slot to the error variant.
 * Successful results carry the full DatasetRow shape (no discriminator key
 * on the success side, so consumers narrow via this guard).
 */
export function isBulkOpError(r: BulkOpResult): r is BulkOpError {
  return typeof r === "object" && r !== null && "error" in r;
}

/**
 * One plain sentence for the rows a batch could not change — the ONE wording
 * every bulk surface uses. A row in Trash is named as such (it can be restored),
 * never reported as "could not be found".
 */
export function describeBulkFailures(failed: BulkOpError[]): string {
  const inTrash = failed.filter((f) => f.error === "row_in_trash").length;
  const missing = failed.length - inTrash;
  const parts: string[] = [];
  if (inTrash > 0) {
    parts.push(
      `${inTrash} row${inTrash === 1 ? " is" : "s are"} in Trash — restore ${inTrash === 1 ? "it" : "them"} from Trash to edit`,
    );
  }
  if (missing > 0) {
    parts.push(
      `${missing} row${missing === 1 ? "" : "s"} could not be found — ${missing === 1 ? "it" : "they"} may have been removed by someone else`,
    );
  }
  return `${parts.join("; ")}.`;
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
  /**
   * How many values could NOT become the new type and were emptied from the
   * grid. Every one of them is in that row's history under `history_reason`,
   * written in the same transaction that emptied the cell — the type change
   * refuses outright rather than empty a cell whose only copy would be lost
   * (DD-244). A screen that shows a type-change result MUST show this number
   * and where the values went.
   */
  values_moved_to_history: number;
  /** The reason stamped on those history rows, e.g. `type_change:string→integer`. */
  history_reason: string;
};

// ─── Validation modes ────────────────────────────────────────────────────────

export type ValidationMode = "permissive" | "strict";

// ─── Service result envelope (matches existing convention) ───────────────────

export type ServiceOk<T> = { success: true; data: T };
/**
 * THE STORE'S OWN REFUSAL, kept whole (lane FIX-15, 2026-09-23).
 *
 * `error` is `PostgrestError.message` and nothing else, so a refusal written as
 * three parts — what happened, what the column is, what to do instead — reached
 * the screen as one third of itself, and the other two thirds (DETAIL and HINT)
 * were thrown away in this envelope. On production a name typed into a relation
 * column was refused by the store with a perfectly good sentence
 * and the person saw nothing usable.
 *
 * `refusal` carries the whole thing in the shape every Matrx screen already
 * knows how to draw (`RefusalNotice` / `RefusalLine` from `@ai-matrx/records-ui`,
 * which run it through `plainWords` so no machine identity is ever printed at a
 * person). `error` stays exactly what it was for the callers that print a line.
 */
export type ServiceErr = { success: false; error: string; refusal?: RecordsError };
export type ServiceResult<T> = ServiceOk<T> | ServiceErr;

/**
 * Narrow a ServiceResult to the failure variant. Use instead of `!result.success`
 * inside generic functions where TS's narrow through `Promise<ServiceResult<T>>`
 * sometimes fails to discriminate the union members reliably.
 */
export function isServiceFailure<T>(r: ServiceResult<T>): r is ServiceErr {
  return r.success === false;
}

// ─── Column shape (column facets / the table profile) ───────────────────────
//
// THE COLUMN KNOWS ITSELF. One shape, two granularities: `ColumnFacets` answers
// "what is in THIS column" and `TableProfile` answers it for every column at
// once. The value picker, the choice-format option seeding, and the column
// profile panel are all consumers of this one answer — none of them may count
// distinct values in the browser again.

/** One distinct value of a column and how many rows carry it. */
export type ColumnFacetValue = {
  value: string;
  count: number;
};

export type ColumnFacets = {
  table_id: string;
  field_name: string;
  /** Rows considered (after the active global search, if any). */
  total_rows: number;
  /** Rows whose cell is non-empty. */
  filled: number;
  /** Rows whose cell is null or whitespace-only — a real filter target. */
  blank: number;
  /** Total distinct non-empty values across EVERY row, not just `values`. */
  distinct_count: number;
  /** Longest value; a caller refuses a picker on a column of long prose. */
  max_length: number;
  /** Distinct values too long (>300 chars) to offer as options. */
  unlistable: number;
  limit: number;
  /** True when `values` does not carry every listable distinct value. */
  truncated: boolean;
  /** Top values by frequency, descending. */
  values: ColumnFacetValue[];
};

/**
 * Per-column evidence from the table profile (`getTableProfile`).
 *
 * The `looks_*` fields are COUNTS, never verdicts — "19 of 20 values are URLs"
 * is a different situation from "20 of 20", and only the caller knows which one
 * is worth acting on.
 */
export type ProfiledColumn = {
  field_name: string;
  display_name: string;
  data_type: FieldDataType;
  is_required: boolean;
  /** The column's declared display format, or null when it has none. */
  format: FieldFormatConfig | null;
  filled: number;
  blank: number;
  distinct_count: number;
  max_length: number;
  looks_numeric: number;
  looks_url: number;
  looks_email: number;
  looks_bool: number;
  top_values: ColumnFacetValue[];
};

export type TableProfile = {
  table_id: string;
  total_rows: number;
  columns: ProfiledColumn[];
};
