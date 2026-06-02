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

import type {
  BulkOp,
  BulkWriteResponse,
  ChangeFieldTypeResponse,
  ChangeFieldTypeStrategy,
  DatasetRow,
  FieldDataType,
  ServiceResult,
} from "./types";

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
