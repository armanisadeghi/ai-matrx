// features/data-tables/data-source/record-store.ts — THE GRID'S DATA SEAM, OVER THE RECORD STORE.
//
// The second implementation of the interface `service.ts` exports (the first is
// the older store's `udt_*` doors, which stay exactly where they were). A table
// reaches this file only when `table-home.ts` says the record store holds it.
//
// Every read and write goes through `@ai-matrx/records`' client — the store's own
// doors, the store's own ladder, the store's own refusals — and comes back in the
// shape the grid already draws (`record-store-shape.ts`). Nothing here reaches a
// `custom` table directly, and nothing decides who may see what: `read_records_*`
// decides the rows and the fields, `my_levels` decides whether this person may
// edit, and a write the store refuses comes back with the store's own sentence
// in `refusal`, which the grid already knows how to draw.
//
// WHAT THE STORE CANNOT DO THAT THE OLDER DOORS DID, AND WHAT THIS FILE DOES
// INSTEAD — each named once, here:
//
//   sort by a column / search   No such door. The page reads the table's rows
//                               through the read door (every row this person may
//                               see, in pages of the door's own size) and sorts
//                               and searches them with the older door's exact
//                               rules (`sortRowsLikeTheOlderStore`). A table past
//                               READ_CEILING is refused by name, never cut short.
//   count rows                  The read door counts nothing it has not read, so
//                               the count is the length of the full read.
//   a bulk write in one txn     There is no bulk UPDATE door (a batch would have
//                               to drop per-row versions). Inserts go in one call
//                               through `record_write_many`; updates and archives
//                               go one record at a time, and each op's result is
//                               reported in its own slot — a refused op never
//                               hides behind the batch.

import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import type { Field, RecordsError } from "@ai-matrx/records";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";
import type { FieldChoice } from "@/lib/field-formats/types";

import type {
  BulkOp,
  BulkOpResult,
  BulkWriteResponse,
  ColumnFacets,
  Dataset,
  DatasetField,
  DatasetRow,
  ServiceErr,
  ServiceResult,
  TableMetadata,
} from "../types";
import type { RecordStoreHome } from "./table-home";
import {
  choiceFromOption,
  jsonbText,
  olderColumnFromField,
  olderRowData,
  searchRowsLikeTheOlderStore,
  sortRowsLikeTheOlderStore,
  storeValue,
} from "./record-store-shape";

/**
 * The most rows one grid read will pull through the read door to sort, search
 * and count. Above it the read is REFUSED with a sentence, never truncated: a
 * sorted page drawn from part of a table is a confident wrong answer.
 */
const READ_CEILING = 10_000;
/** What the grid asks the read door for per call. The door clamps it to its own page size. */
const READ_PAGE = 200;
/** A metadata read followed by a page read is one question; they share one snapshot this long. */
const SNAPSHOT_TTL_MS = 1_500;

// ─── the client ──────────────────────────────────────────────────────────────

const clients = new Map<string, RecordsClient>();

function clientFor(home: RecordStoreHome): RecordsClient {
  const key = `${home.organizationId}:${home.userId ?? ""}`;
  let client = clients.get(key);
  if (!client) {
    client = createRecordsClient({
      dataSource: recordsDataSource(createClient()),
      actor: personActor(home.userId),
      organizationId: home.organizationId,
    });
    clients.set(key, client);
  }
  return client;
}

function refused(error: RecordsError): ServiceErr {
  return { success: false, error: error.message, refusal: error };
}

function plainFailure(message: string): ServiceErr {
  return { success: false, error: message };
}

// ─── the snapshot: one table, read once per question ────────────────────────

type GridRow = { id: string; data: Record<string, unknown> };

type Snapshot = {
  table: Dataset;
  fields: Field[];
  columns: DatasetField[];
  rows: GridRow[];
  /** The caller's level on the Table, from `custom.my_levels`. */
  level: string | null;
  at: number;
};

const snapshots = new Map<string, Promise<ServiceResult<Snapshot>>>();

/** Drop what this browser holds for a table — after a write, or when the store says it moved. */
export function invalidateRecordStoreTable(tableId: string): void {
  snapshots.delete(tableId);
}

function asDataset(tableId: string, home: RecordStoreHome, document: Record<string, unknown>): Dataset {
  const name = typeof document.name === "string" ? document.name : "";
  const description = typeof document.description === "string" ? document.description : null;
  const now = new Date().toISOString();
  return {
    id: tableId,
    table_name: name,
    description,
    organization_id: home.organizationId,
    // Ownership in the record store is a LEVEL on the Table, not a column on it,
    // so there is no owner id to hand the grid. The grid's edit gate asks
    // `hasEditorAccess` (my_levels) instead — see service.ts.
    user_id: "",
    created_by: "",
    updated_by: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    is_public: false,
    // Every write to the record store is judged by the column's rules — there is
    // no permissive mode to switch off. The grid's Strict switch reads this.
    validation_mode: "strict",
    row_ordering_config: null,
    metadata: {},
    custom_fields: {},
    project_id: null,
    sheet_index: null,
    sync_source: null,
    task_id: null,
    template_id: null,
    template_version: null,
    version: 1,
    visibility: "personal",
    workbook_id: null,
  } as Dataset;
}

async function choicesFor(client: RecordsClient, field: Field): Promise<FieldChoice[] | null> {
  if (String(field.type) !== "list") return null;
  const options = await client.fieldOptions({ field_id: field.id });
  if (!options.ok) return null;
  return options.data
    .map((option) => choiceFromOption(option as { data?: Record<string, unknown> | null }))
    .filter((c): c is FieldChoice => c !== null);
}

async function readEveryRow(
  client: RecordsClient,
  tableId: string,
): Promise<ServiceResult<Array<{ id: string; document: Record<string, unknown> }>>> {
  const out: Array<{ id: string; document: Record<string, unknown> }> = [];
  // Until an EMPTY page: the door clamps the page size to its own, so a short
  // page is not proof of the end.
  for (let offset = 0; ; ) {
    const page = await client.list({ table_id: tableId, limit: READ_PAGE, offset });
    if (!page.ok) return refused(page.error);
    if (page.data.rows.length === 0) break;
    for (const row of page.data.rows) out.push({ id: row.id, document: row.document as Record<string, unknown> });
    offset += page.data.rows.length;
    if (out.length > READ_CEILING) {
      return plainFailure(
        `This table has more than ${READ_CEILING.toLocaleString()} records, and this grid sorts, searches and counts them in your browser because the record store has no door that does it yet. Open it at /data-v2/${tableId}, which pages through the store instead.`,
      );
    }
  }
  return { success: true, data: out };
}

async function readSnapshot(home: RecordStoreHome, tableId: string): Promise<ServiceResult<Snapshot>> {
  const client = clientFor(home);
  const [tableRead, fieldsRead, levelRead] = await Promise.all([
    client.recordRead({ record_id: tableId }),
    client.fields({ table_id: tableId }),
    client.myLevels({ ids: [tableId] }),
  ]);
  if (!tableRead.ok) return refused(tableRead.error);
  if (!fieldsRead.ok) return refused(fieldsRead.error);
  const fields = fieldsRead.data;
  const choiceSets = await Promise.all(fields.map((f) => choicesFor(client, f)));
  const columns = fields.map((f, i) => olderColumnFromField(f as Field & { expression?: unknown }, tableId, choiceSets[i] ?? null));
  const rowsRead = await readEveryRow(client, tableId);
  if (!rowsRead.success) return rowsRead;
  const rows = rowsRead.data.map((row) => ({ id: row.id, data: olderRowData(row.document, columns) }));
  const level = levelRead.ok ? (levelRead.data.find((l) => l.id === tableId)?.level ?? null) : null;
  return {
    success: true,
    data: {
      table: asDataset(tableId, home, tableRead.data.document as Record<string, unknown>),
      fields,
      columns,
      rows,
      level: level ? String(level) : null,
      at: Date.now(),
    },
  };
}

async function snapshot(home: RecordStoreHome, tableId: string, fresh = false): Promise<ServiceResult<Snapshot>> {
  const held = snapshots.get(tableId);
  if (held && !fresh) {
    const answer = await held;
    if (answer.success && Date.now() - answer.data.at < SNAPSHOT_TTL_MS) return answer;
  }
  const pending = readSnapshot(home, tableId);
  snapshots.set(tableId, pending);
  const answer = await pending;
  if (!answer.success) snapshots.delete(tableId);
  return answer;
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function getTableMetadata(
  home: RecordStoreHome,
  args: { tableId: string },
): Promise<ServiceResult<TableMetadata>> {
  const snap = await snapshot(home, args.tableId, true);
  if (!snap.success) return snap;
  return {
    success: true,
    data: { table: snap.data.table, columns: snap.data.columns, row_count: snap.data.rows.length },
  };
}

function pageRows(
  snap: Snapshot,
  args: { sortField?: string | null; sortDirection?: "asc" | "desc"; searchTerm?: string | null },
): GridRow[] {
  let rows: GridRow[] = snap.rows;
  if (args.searchTerm) rows = searchRowsLikeTheOlderStore(rows, args.searchTerm);
  if (args.sortField) {
    const column = snap.columns.find(
      (c) => c.field_name === args.sortField || c.display_name === args.sortField,
    );
    if (column) {
      rows = sortRowsLikeTheOlderStore(rows, column.field_name, args.sortDirection ?? "asc", column.data_type);
    }
  }
  return rows;
}

export async function getTablePage(
  home: RecordStoreHome,
  args: {
    tableId: string;
    limit: number;
    offset: number;
    sortField?: string | null;
    sortDirection?: "asc" | "desc";
    searchTerm?: string | null;
  },
): Promise<ServiceResult<{ rows: GridRow[]; pagination: { total_count: number; page_count: number; current_page: number } }>> {
  const snap = await snapshot(home, args.tableId);
  if (!snap.success) return snap;
  const rows = pageRows(snap.data, args);
  const limit = Math.max(1, args.limit);
  const offset = Math.max(0, args.offset);
  return {
    success: true,
    data: {
      rows: rows.slice(offset, offset + limit),
      pagination: {
        total_count: rows.length,
        page_count: Math.ceil(rows.length / limit),
        current_page: Math.floor(offset / limit) + 1,
      },
    },
  };
}

export async function getCompleteTable(
  home: RecordStoreHome,
  args: { tableId: string; sortField?: string | null; sortDirection?: "asc" | "desc" },
): Promise<
  ServiceResult<{
    table: Record<string, unknown>;
    fields: Array<Record<string, unknown> & { id: string; field_name: string; display_name: string }>;
    rows: Array<Record<string, unknown> & { id: string; data: Record<string, unknown> }>;
  }>
> {
  const snap = await snapshot(home, args.tableId, true);
  if (!snap.success) return snap;
  return {
    success: true,
    data: {
      table: snap.data.table as unknown as Record<string, unknown>,
      fields: snap.data.columns as unknown as Array<Record<string, unknown> & { id: string; field_name: string; display_name: string }>,
      rows: pageRows(snap.data, { sortField: args.sortField, sortDirection: args.sortDirection }),
    },
  };
}

/** May this person edit the table? The store's own level, never a guess from ownership. */
export async function hasEditorAccess(home: RecordStoreHome, args: { tableId: string }): Promise<boolean> {
  const answer = await clientFor(home).myLevels({ ids: [args.tableId] });
  if (!answer.ok) return false;
  const level = answer.data.find((l) => l.id === args.tableId)?.level ?? null;
  return level === "editor" || level === "admin";
}

/** The tables the header's switcher lists: this organization's record-store Tables. */
export async function listTables(
  home: RecordStoreHome,
): Promise<ServiceResult<Array<{ id: string; table_name: string; description: string | null; row_count: number; field_count: number }>>> {
  const answer = await clientFor(home).tableList();
  if (!answer.ok) return refused(answer.error);
  return {
    success: true,
    data: answer.data
      .filter((t) => !t.is_kernel)
      .map((t) => ({
        id: t.id,
        table_name: t.name,
        description: null,
        // The Table record names its fields; its rows are not counted without reading them.
        row_count: 0,
        field_count: Array.isArray(t.fields) ? t.fields.length : 0,
      })),
  };
}

/** Distinct values of one column over EVERY row this person may see — never a page. */
export async function getColumnFacets(
  home: RecordStoreHome,
  args: { tableId: string; fieldName: string; limit?: number; searchTerm?: string | null },
): Promise<ServiceResult<ColumnFacets>> {
  const snap = await snapshot(home, args.tableId);
  if (!snap.success) return snap;
  const column = snap.data.columns.find((c) => c.field_name === args.fieldName);
  if (!column) {
    return plainFailure(`"${args.fieldName}" is not a column of this table.`);
  }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  const rows = args.searchTerm ? searchRowsLikeTheOlderStore(snap.data.rows, args.searchTerm) : snap.data.rows;
  const counts = new Map<string, number>();
  let filled = 0;
  let blank = 0;
  let maxLength = 0;
  let unlistable = 0;
  for (const row of rows) {
    const raw = row.data[args.fieldName];
    const values = Array.isArray(raw) ? raw : [raw];
    const texts = values
      .map((v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : jsonbText(v)))
      .map((t) => t.trim());
    const any = texts.some((t) => t !== "");
    if (any) filled += 1;
    else blank += 1;
    for (const text of texts) {
      if (text === "") continue;
      maxLength = Math.max(maxLength, text.length);
      if (text.length > 300) {
        unlistable += 1;
        continue;
      }
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  const values = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([value, count]) => ({ value, count }));
  return {
    success: true,
    data: {
      table_id: args.tableId,
      field_name: args.fieldName,
      total_rows: rows.length,
      filled,
      blank,
      distinct_count: counts.size,
      max_length: maxLength,
      unlistable,
      limit,
      truncated: values.length > limit,
      values: values.slice(0, limit),
    } as ColumnFacets,
  };
}

// ─── writes ──────────────────────────────────────────────────────────────────

function asDatasetRow(tableId: string, home: RecordStoreHome, id: string, data: Record<string, unknown>): DatasetRow {
  const now = new Date().toISOString();
  return {
    id,
    table_id: tableId,
    data,
    organization_id: home.organizationId,
    user_id: home.userId ?? "",
    created_by: home.userId ?? "",
    updated_by: home.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    is_public: false,
    metadata: {},
    custom_fields: {},
    source_row_ref: null,
    version: 1,
  } as unknown as DatasetRow;
}

async function columnsOf(home: RecordStoreHome, tableId: string): Promise<ServiceResult<DatasetField[]>> {
  const snap = await snapshot(home, tableId);
  if (!snap.success) return snap;
  return { success: true, data: snap.data.columns };
}

function toStoreDocument(columns: DatasetField[], data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = storeValue(columns.find((c) => c.field_name === key), value);
  }
  return out;
}

export async function upsertCell(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; fieldName: string; value: unknown },
): Promise<ServiceResult<DatasetRow>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const patch = toStoreDocument(columns.data, { [args.fieldName]: args.value });
  const written = await clientFor(home).recordUpdate({ record_id: args.rowId, patch });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: asDatasetRow(args.tableId, home, args.rowId, { [args.fieldName]: args.value }) };
}

/** Every declared column absent from `data` goes out as null, so an update REPLACES as the older door did. */
function replacing(columns: DatasetField[], data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const c of columns) {
    if (!(c.field_name in out) && !isComputed(c)) out[c.field_name] = null;
  }
  return out;
}

function isComputed(column: DatasetField): boolean {
  const format = (column.metadata as { format?: { id?: string } } | null)?.format?.id;
  return format === "formula" || format === "autonumber" || format === "created_time" || format === "modified_time";
}

export async function upsertRow(
  home: RecordStoreHome,
  args: { tableId: string; rowId?: string | null; data: Record<string, unknown> },
): Promise<ServiceResult<DatasetRow>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const client = clientFor(home);
  if (!args.rowId) {
    const made = await client.recordWrite({
      table_id: args.tableId,
      data: toStoreDocument(columns.data, args.data) as never,
    });
    invalidateRecordStoreTable(args.tableId);
    if (!made.ok) return refused(made.error);
    return { success: true, data: asDatasetRow(args.tableId, home, made.data, args.data) };
  }
  const written = await client.recordUpdate({
    record_id: args.rowId,
    patch: toStoreDocument(columns.data, replacing(columns.data, args.data)),
  });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: asDatasetRow(args.tableId, home, args.rowId, args.data) };
}

/** Archive one row — `record_delete` is soft and reversible within the Table's retention. */
export async function deleteRow(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string },
): Promise<ServiceResult<{ row_id: string; archived_at: string }>> {
  const done = await clientFor(home).recordDelete({ record_id: args.rowId });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: { row_id: args.rowId, archived_at: String(done.data) } };
}

export async function bulkWrite(
  home: RecordStoreHome,
  args: { tableId: string; operations: BulkOp[] },
): Promise<ServiceResult<BulkWriteResponse>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const client = clientFor(home);
  const results: BulkOpResult[] = new Array(args.operations.length);

  // Inserts first, in ONE call, in their original order — `record_write_many`
  // answers the new ids in the order the rows were handed in.
  const insertAt: number[] = [];
  const inserts: Record<string, unknown>[] = [];
  args.operations.forEach((op, i) => {
    if (op.op === "insert") {
      insertAt.push(i);
      inserts.push(toStoreDocument(columns.data, op.data));
    }
  });
  if (inserts.length > 0) {
    const made = await client.recordWriteMany({ table_id: args.tableId, rows: inserts as never });
    if (!made.ok) {
      invalidateRecordStoreTable(args.tableId);
      return refused(made.error);
    }
    made.data.forEach((id, n) => {
      const at = insertAt[n]!;
      const op = args.operations[at] as Extract<BulkOp, { op: "insert" }>;
      results[at] = asDatasetRow(args.tableId, home, id, op.data);
    });
  }

  // The rest, one record at a time. A refusal stops the batch there and names
  // the op, because the older door's contract was one transaction: carrying on
  // past a refused op would leave a half-written selection nobody asked for.
  for (let i = 0; i < args.operations.length; i += 1) {
    const op = args.operations[i]!;
    if (op.op === "insert") continue;
    let outcome: { ok: true } | { ok: false; error: RecordsError };
    if (op.op === "delete") {
      const done = await client.recordDelete({ record_id: op.row_id });
      outcome = done.ok ? { ok: true } : { ok: false, error: done.error };
      if (done.ok) results[i] = asDatasetRow(args.tableId, home, op.row_id, {});
    } else {
      const data =
        op.op === "cell"
          ? { [op.field_name]: op.value }
          : op.op === "update"
            ? replacing(columns.data, op.data)
            : op.data;
      const done = await client.recordUpdate({ record_id: op.row_id, patch: toStoreDocument(columns.data, data) });
      outcome = done.ok ? { ok: true } : { ok: false, error: done.error };
      if (done.ok) results[i] = asDatasetRow(args.tableId, home, op.row_id, data);
    }
    if (!outcome.ok) {
      invalidateRecordStoreTable(args.tableId);
      const written = results.filter(Boolean).length;
      const err = refused(outcome.error);
      return {
        ...err,
        error:
          written > 0
            ? `${outcome.error.message} (${written} of ${args.operations.length} changes were saved before this one was refused; the rest were not attempted.)`
            : outcome.error.message,
      };
    }
  }
  invalidateRecordStoreTable(args.tableId);
  return { success: true, data: { table_id: args.tableId, count: args.operations.length, results } };
}
