/**
 * THE DATA SEAM for user tables. Every table lives in the record store (`custom.*`); every export
 * here takes the table's id, finds the table's own organization once (`locateTable`, remembered in
 * `data-source/table-home.ts`) and answers through `data-source/record-store.ts`. Call these from
 * any client-side code (components, hooks, agent tools) — never a store door directly — so a UI
 * edit and an agent edit always take one path, with one `ServiceResult<T>` envelope.
 *
 * See `features/data-tables/FEATURE.md` for architectural context.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";

import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

import type { ChoiceRehome, ChoicesRehomed, ChoiceUsage } from "@ai-matrx/records";
import * as recordStore from "./data-source/record-store";
import { placeTableInRecordStore, type RecordStoreHome } from "./data-source/table-home";
import { locateTable } from "./data-source/locate-table";
import { recordChangeActions } from "./data-source/record-store-grid";
import { toRecordSourceKey } from "@/features/scheduling/utils/recordSourceKey";

import {
  type AddColumnParams,
  type AddColumnResult,
  type CreateTableParams,
  type CreateTableResult,
  type GetTableResult,
} from "@/features/data-tables/table-shapes";
import { whereANewTableIsBorn } from "./data-source/where-a-table-is-born";
import { getUserOrganizations } from "@/features/organizations/service";
import { sanitizeFieldName } from "@/features/data-tables/field-name-key";
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
} from "./types";

/**
 * The table's home for the seam: remembered once a host or `locateTable` asked the store, otherwise
 * asked now. A table the store does not hold for this person, or a store that could not be asked,
 * answers a failure in words — nothing is read or written anywhere else.
 */
async function homeOf(tableId: string): Promise<{ ok: true; home: RecordStoreHome } | { ok: false; failure: ServiceErr }> {
  const located = await locateTable(tableId);
  if (!located.ok) return { ok: false, failure: { success: false, error: located.error } };
  return { ok: true, home: located.home };
}

export type GetTableMetadataArgs = {
  tableId: string;
  /** Optional guard — refused when it does not match the stored name. */
  tableName?: string;
};

/**
 * A dataset's identity, column schema and row COUNT — without loading a single
 * row. This is the default read for any surface that renders a picker, a
 * column list, a settings form, a header, or a pagination total.
 */
export async function getTableMetadata(
  args: GetTableMetadataArgs,
): Promise<ServiceResult<TableMetadata>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getTableMetadata(home.home, args);
}

/** One table in a list (`custom.table_list_everywhere`, or the store's table list). */
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
  /** The store's word for where the table lives (`custom.table_list_everywhere` says "records"). */
  store?: "records";
  /** The organization the table lives in. */
  organization_id?: string | null;
  /** Its name, set when the list spans more than one organization. */
  organization_name?: string | null;
};

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
 * a page deliberately does not carry it.
 */
export async function getTablePage(
  args: GetTablePageArgs,
): Promise<ServiceResult<TablePage>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getTablePage(home.home, args);
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
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getCompleteTable(home.home, args) as Promise<ServiceResult<CompleteTable>>;
}

// ─── rows ──────────────────────────────────────────────────────────────────────

export type UpsertRowArgs = {
  tableId: string;
  /** Pass `null` (or omit) to insert; pass a row id to update that row. */
  rowId?: string | null;
  data: Record<string, unknown>;
  /** The version the person saw (undo: its own write's). Absent = the seam's ledger of the rows it drew. */
  expectedVersion?: number | null;
};

export async function upsertRow(
  args: UpsertRowArgs,
): Promise<ServiceResult<DatasetRow>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.upsertRow(home.home, args);
}

// ─── cells ─────────────────────────────────────────────────────────────────────

export type UpsertCellArgs = {
  tableId: string;
  rowId: string;
  fieldName: string;
  value: unknown;
  /** The version the person saw (undo: its own write's). Absent = the seam's ledger of the rows it drew. */
  expectedVersion?: number | null;
};

export async function upsertCell(
  args: UpsertCellArgs,
): Promise<ServiceResult<DatasetRow>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.upsertCell(home.home, args);
}

/** Save a choice cell with words that become one of its column's choices: one transaction adds the choice and saves the cell. */
export async function upsertCellAddingChoice(
  args: UpsertCellArgs & { add: string[]; format: FieldFormatConfig },
): Promise<ServiceResult<DatasetRow>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.upsertCellAddingChoice(home.home, args);
}

/**
 * Words added to a column's choices, nothing else touched (BREAKER-2 B2-02: the paste's one question
 * answered Add), through `custom.field_update`'s `options_add`.
 */
export async function addChoicesToColumn(args: {
  tableId: string;
  fieldId: string;
  words: string[];
  format: FieldFormatConfig;
}): Promise<ServiceResult<{ field_id: string }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.addChoicesToColumn(home.home, args);
}

// ─── many changes in one transaction ───────────────────────────────────────────

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
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.bulkWrite(home.home, args);
}

// ─── a column's type ───────────────────────────────────────────────────────────

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
 * realtime fanout. Then changes the column's type.
 */
export async function changeFieldType(
  args: ChangeFieldTypeArgs,
): Promise<ServiceResult<ChangeFieldTypeResponse>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.changeFieldType(home.home, args) as Promise<ServiceResult<ChangeFieldTypeResponse>>;
}

// ─── remove a column ───────────────────────────────────────────────────────────

export type DeleteFieldArgs = {
  tableId: string;
  fieldId: string;
};

export type DeleteFieldResponse = {
  table_id: string;
  field_id: string;
  field_name: string;
  display_name: string;
  /** Always 0: removing a column archives it and keeps every row's value. */
  rows_cleared: number;
};

/**
 * Removes a column: it is archived (delete means archive, 2026-09-27) and its
 * values stay on every row.
 *
 * THE ONE delete-column path. Every surface that lets a user manage columns
 * (the table settings rail, the column header menu) calls this rather than touching
 * the field row directly. A removed column comes back with its values (`restoreField`).
 *
 * Refuses to remove the last remaining column.
 */
export async function deleteField(
  args: DeleteFieldArgs,
): Promise<ServiceResult<DeleteFieldResponse>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.deleteField(home.home, args);
}

// ─── a column's format ─────────────────────────────────────────────────────────

export type SetFieldFormatArgs = {
  tableId: string;
  fieldId: string;
  /** Pass `null` to clear the format and fall back to the storage type. */
  format: FieldFormatConfig | null;
  /**
   * Where the records of each removed choice go, keyed by the option's id (lane CHOICE-TAILS):
   * moved to another choice, kept as other values, or cleared — in the same save as the list.
   */
  rehome?: Record<string, ChoiceRehome> | undefined;
};

/**
 * How many records hold each choice of a column (lane CHOICE-TAILS), keyed by the option's id.
 */
export async function getChoiceUsage(args: {
  tableId: string;
  fieldId: string;
}): Promise<ServiceResult<Record<string, ChoiceUsage> | null>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getChoiceUsage(home.home, args);
}

/** Puts a choice removal back: the list and every cell as they were, one save (lane CHOICE-TAILS). */
export async function undoChoiceRemoval(args: {
  tableId: string;
  fieldId: string;
  undo: ChoicesRehomed["undo"];
}): Promise<ServiceResult<{ field_id: string; cells_back: number }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.undoChoiceRemoval(home.home, args);
}

/**
 * Writes a column's display format (`metadata.format` on the grid's column).
 *
 * Purely additive: `data_type` and every stored value are untouched, so a
 * format can be set, changed, or cleared with zero risk to the data. See
 * `lib/field-formats/FEATURE.md`.
 */
export async function setFieldFormat(
  args: SetFieldFormatArgs,
): Promise<ServiceResult<{ field_id: string; undo?: ChoicesRehomed["undo"]; rehomed?: ChoicesRehomed["rehomed"] }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setFieldFormat(home.home, args);
}

/** Number the existing rows of an Autonumber column. Idempotent. */
export async function backfillAutonumber(args: {
  tableId: string;
  fieldId: string;
}): Promise<ServiceResult<{ numbered: number; highest: number }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.backfillAutonumber(home.home, args);
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
 * Rename ONE column's header (its `display_name`; the machine `field_name`
 * never changes, so stored rows, filters, colors and saved views are
 * untouched) and keep every FORMULA that referred to the old header working
 * by rewriting `{Old name}` → `{New name}` in it.
 *
 * The name is written first; a formula that then fails to update is REPORTED in
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

  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.renameColumn(home.home, { tableId: args.tableId, fieldId: args.field.id, newName });
}

// ─── colors ────────────────────────────────────────────────────────────────────

export type SetTableStyleArgs = {
  tableId: string;
  /** One of the `stylePath.*` builders in `table-style.ts`. */
  path: readonly string[];
  /** `null` deletes the key. */
  value: unknown;
};

/**
 * Write ONE path of the table's color style (`metadata.style`). Surgical by
 * design — see `table-style.ts`.
 */
export async function setTableStyle(
  args: SetTableStyleArgs,
): Promise<ServiceResult<{ style: unknown }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setTableStyle(home.home, args);
}

// ─── column order ──────────────────────────────────────────────────────────────

/**
 * Renumber columns — the second half of "insert column left / right". The new
 * column is created AT the target order; this shifts every column that already
 * held that order or a later one by +1, so two columns never share a slot.
 */
export async function renumberFields(args: {
  tableId: string;
  updates: { id: string; field_order: number }[];
}): Promise<ServiceResult<{ updated: number }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.renumberFields(home.home, args);
}

// ─── archive a table ─────────────────────────────────────────────────────────

/**
 * Move a whole table to Trash (the store's `record_delete`; delete means archive).
 */
export async function archiveTable(tableId: string): Promise<ServiceResult<{ table_id: string }>> {
  const home = await homeOf(tableId);
  if (!home.ok) return home.failure;
  const done = await recordStore.archiveTable(home.home, { tableId });
  return done.success ? { success: true, data: { table_id: tableId } } : done;
}

// ─── table name and description ────────────────────────────────────────────────

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
 * The table-level metadata twin of `upsertCell`.
 *
 * An OMITTED field is left alone rather than nulled. That is what makes a description-only write safe — it cannot
 * blank the table's name or flip whether it is published to the web as a side effect. Pass only
 * what you intend to change.
 *
 * Requires editor access; a refusal surfaces here as a failure envelope.
 *
 * This is the ONE path for table metadata:
 * The table settings rail and the surface `table_description` write target all go
 * through it, so a UI edit and an agent edit can never disagree.
 */
export async function updateTableMetadata(
  args: UpdateTableMetadataArgs,
): Promise<ServiceResult<UpdatedTableMetadata>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.updateTableMetadata(home.home, args);
}

// ─── column facets and the table profile ───────────────────────────────────────
//
// THE COLUMN KNOWS ITSELF — read `features/data-tables/FEATURE.md` § Column
// shape before adding another "count the distinct values" path.
//
// These replace counting in the browser. The grid does not pull rows down
// to filter client-side (a cap would answer confidently over a partial set). Distinct values, counts and fill rates are computed in
// the database over EVERY row, or the call fails — there is no partial answer.

export type GetColumnFacetsArgs = {
  tableId: string;
  /** MACHINE field name. A display name is refused, not guessed. */
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
 * column is refused (never an empty list, which reads as "the column is empty").
 */
export async function getColumnFacets(
  args: GetColumnFacetsArgs,
): Promise<ServiceResult<ColumnFacets>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getColumnFacets(home.home, args);
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
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.getTableProfile(home.home, args) as Promise<ServiceResult<TableProfile>>;
}

// ─── row label and row actions ─────────────────────────────────────────────────

/**
 * Set or clear the table's ROW LABEL — the value that names a row wherever the
 * row is referred to (`features/data-tables/row-label.ts`). `null` clears it
 * and the readers fall back to the first ordinary column.
 */
export async function setTableRowLabel(args: {
  tableId: string;
  rowLabel: import("./row-label").RowLabelConfig | null;
}): Promise<ServiceResult<{ row_label: unknown }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setTableRowLabel(home.home, args);
}

/**
 * Replace the table's ROW ACTIONS — the one-click buttons on a row
 * (`features/data-tables/row-actions.ts`). An empty list clears them.
 */
export async function setTableRowActions(args: {
  tableId: string;
  rowActions: import("./row-actions").RowAction[];
}): Promise<ServiceResult<{ row_actions: unknown }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setTableRowActions(home.home, args as { tableId: string; rowActions: Record<string, unknown>[] });
}

// ─── access, row order, default sort, rows ──────────────────────────────────

/**
 * May the signed-in person EDIT this table? The owner never asks (the viewer
 * knows ownership from the table row); a shared editor is answered by the
 * store (`custom.my_levels`).
 */
export async function hasEditorAccess(args: { tableId: string }): Promise<boolean> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return false;
  return recordStore.hasEditorAccess(home.home, args);
}

/** Turn manual row ordering on with this order, or off (`enabled: false`, empty order). */
export async function setRowOrdering(args: {
  tableId: string;
  enabled: boolean;
  order: string[];
}): Promise<ServiceResult<null>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setRowOrdering(home.home, args);
}

/** Save (or, with no field, clear) the table's default sort. */
export async function setDefaultSort(args: {
  tableId: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}): Promise<ServiceResult<null>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.setDefaultSort(home.home, args);
}

/** Archive one row (delete means archive). */
export async function deleteRow(args: {
  tableId: string;
  rowId: string;
}): Promise<ServiceResult<unknown>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.deleteRow(home.home, args);
}

/**
 * The words the relation cells of `rowIds` read in `fieldName`
 * (`custom.relation_words_many`, the grid's own door). A table that cannot be located answers an
 * empty map, never a guess.
 */
export async function readRelationWords(args: {
  tableId: string;
  fieldName: string;
  rowIds: readonly string[];
}): Promise<Map<string, string>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return new Map();
  return recordStore.relationWords(home.home, args);
}

/**
 * EVERY TABLE A "SAVE INTO A TABLE" PICKER MAY OFFER (lane INTEG-CLIENTS, CUTOVER-PLAN F1).
 * Every Table the person may open in any organization, one list. The save paths `locateTable`
 * before they write.
 */
export async function listTablesEverywhere(args: { organizationId?: string | null } = {}): Promise<
  ServiceResult<UserTableListItem[]>
> {
  // ACCESS BELONGS TO THE PERSON: with no organization named, `custom.table_list_everywhere` answers
  // for EVERY organization the person belongs to (NULL = all), never the selected one, and never asks
  // to choose one. `organizationId` is only an explicit narrowing a picker's own on-page control passes.
  // THE ONE LIST, from the database (GRID-PRIMITIVES G9), each Table with its real row count.
  const everywhere = await (supabase as unknown as SupabaseClient)
    .schema("custom")
    .rpc("table_list_everywhere", args.organizationId ? { p_organization_id: args.organizationId } : {});
  if (everywhere.error) return { success: false, error: everywhere.error.message };
  const payload = everywhere.data as { success?: boolean; tables?: unknown } | null;
  const tables = Array.isArray(payload?.tables) ? (payload.tables as UserTableListItem[]) : [];
  return { success: true, data: await withOrganizationNames(tables) };
}

/**
 * Each table names the organization it lives in, so a list that spans several stays readable.
 * Best effort: a failed membership read leaves the names off (and says so once), never the list.
 */
async function withOrganizationNames(rows: UserTableListItem[]): Promise<UserTableListItem[]> {
  const orgIds = new Set(rows.map((r) => r.organization_id).filter((id): id is string => Boolean(id)));
  if (orgIds.size < 2) return rows;
  try {
    const mine = await getUserOrganizations();
    const names = new Map(mine.map((o) => [o.id, o.name] as const));
    return rows.map((r) => ({ ...r, organization_name: (r.organization_id && names.get(r.organization_id)) || null }));
  } catch (err) {
    console.warn(`[data-tables] Could not read organization names for the table list: ${err instanceof Error ? err.message : String(err)}`);
    return rows;
  }
}

/**
 * Run an update row action over a selection. The store runs the whole selection in one
 * transaction and works every formula step out itself (G2).
 */
export async function runRowAction(args: {
  tableId: string;
  actionId: string;
  rowIds: readonly string[];
}): Promise<ServiceResult<{ changed: number }>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.runRowAction(home.home, args);
}

/** Exactly these rows, read again from the table's store (after a write the store did itself). */
export async function readRowsById(args: {
  tableId: string;
  rowIds: readonly string[];
}): Promise<ServiceResult<TablePage["rows"]>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.rowsById(home.home, args);
}

// ─── history ────────────────────────────────────────────────────────────────
//
// A row's history is the store's own (`custom.record_history`), restored by the store's own
// verbs — never by writing a snapshot over it.

export async function restoreRowVersion(args: { tableId: string; rowId: string; version: number; seenVersion: number | null }) {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.restoreRowVersion(home.home, args);
}

export async function revertRowField(args: { tableId: string; rowId: string; fieldName: string; version: number; seenVersion: number | null }) {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.revertRowField(home.home, args);
}

/** The version this browser drew a row at — what an undo step is sent against (`null` = unread). */
export { seenRowVersion } from "./data-source/record-store";

/** The storage types a column can be changed into (the grid's Stores list). */
export { RECORD_STORE_COLUMN_TYPES } from "./data-source/record-store";

/** Bring a removed (retired) column back with its values (DATA-V2-BASICS-2 F18). */
export async function restoreField(args: { tableId: string; fieldId: string }) {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.restoreField(home.home, args);
}

export async function restoreArchivedRow(args: { tableId: string; rowId: string }) {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.restoreArchivedRow(home.home, args);
}

/**
 * The table-and-column settings write the settings dialogs send (a table's name and
 * description, a column's name, position, required mark and rules): each column's change
 * through `custom.field_update`, the table's through its own record.
 */
export async function updateTableConfig(args: {
  tableId: string;
  tableUpdates?: Record<string, unknown>;
  fieldUpdates?: Array<Record<string, unknown> & { id: string }>;
}): Promise<ServiceResult<null>> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return home.failure;
  return recordStore.updateTableConfig(home.home, args);
}

// ─── the Add Column / Add Row forms ─────────────────────────────────────────
//
// The store's own doors (`custom.field_declare`, `custom.record_write`).

export async function addTableColumn(
  params: AddColumnParams,
): Promise<AddColumnResult> {
  const home = await homeOf(params.tableId);
  if (!home.ok) return home.failure;
  return recordStore.addColumn(home.home, params);
}

/**
 * MAKE A NEW TABLE, OUTSIDE THE GRID (lane INTEG-CLIENTS, CUTOVER-PLAN F4/F5). The ONE
 * birth every "save this as a table" caller uses — a chat answer, a CSV or JSON block, a
 * canvas table, a page extraction, the zip heatmap, the ts-function registry. The table is
 * born in the record store, in the organization the person makes it in, and PLACED, so the
 * caller's next `bulkWrite` / `addTableRow` / `addTableColumn` / `readTableDetails` on the new
 * id needs no further question.
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
  const made = await recordStore.createTable(born.home, {
    tableName: params.tableName.trim(),
    description: params.description,
    // Callers key their rows by `sanitizeFieldName(header)`, so the columns are named the same way.
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
  return { success: true, tableId: made.tableId, ...(made.warning ? { warning: made.warning } : {}) };
}

export async function readTableDetails(tableId: string): Promise<GetTableResult> {
  const home = await homeOf(tableId);
  if (!home.ok) return home.failure;
  return recordStore.tableDetails(home.home, tableId) as Promise<GetTableResult>;
}

export async function addTableRow(params: { tableId: string; data: Record<string, unknown> }): Promise<{
  success: boolean;
  rowId?: string;
  error?: string;
}> {
  const home = await homeOf(params.tableId);
  if (!home.ok) return home.failure;
  const made = await recordStore.upsertRow(home.home, { tableId: params.tableId, data: params.data });
  return made.success ? { success: true, rowId: made.data.id } : { success: false, error: made.error };
}

/**
 * "When a row changes, run an agent…" for this table: which changes a schedule may listen
 * for, or `null` when a schedule on it would never fire (`custom.record_change_actions`).
 */
export async function rowChangeScheduleFor(args: {
  tableId: string;
}): Promise<{ entityType: string; actions: Array<{ value: string; label: string }> } | null> {
  const home = await homeOf(args.tableId);
  if (!home.ok) return null;
  const answer = await recordChangeActions(home.home, args.tableId);
  if (!answer.ok) return null;
  // The STORE's word for this table's changes (`record:<table id>`), never the installed
  // package's: a client on an older @ai-matrx/records must not save a key the store refuses.
  return { entityType: toRecordSourceKey(answer.data.entity_type), actions: answer.data.actions };
}

