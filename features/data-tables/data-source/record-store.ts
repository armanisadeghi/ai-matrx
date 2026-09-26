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
import { actionRefusals } from "@ai-matrx/records";
import type {
  DecorationPath,
  Field,
  HiddenFieldNotice,
  RecordHistoryEntry,
  RecordsError,
  RowAction as StoreRowAction,
} from "@ai-matrx/records";
import { declareTable, personActor, recordsDataSource, resolveTableStyle, type NewFieldSpec } from "@ai-matrx/records-ui";
import { withheldCells, type WithheldCells } from "../withheld-cells";

import { createClient } from "@/utils/supabase/client";
import type { FieldChoice } from "@ai-matrx/design-system/field-formats";

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
import { handOrderAbsence, migrateRetype, readRecordsInViewOrder, viewRecordOrderSet } from "./record-store-grid";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import {
  choiceFromOption,
  jsonbText,
  olderColumnFromField,
  olderRowData,
  olderRowOrdering,
  searchRowsLikeTheOlderStore,
  sortRowsLikeTheOlderStore,
  storeDefaultSort,
  storeFormatWrite,
  storeRulesFromOlder,
  storeValue,
  withHandOrder,
  type StoreHandOrder,
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
/** The store's history page ceiling (PAGE-1 — custom.page_contract answers 500). */
const HISTORY_PAGE = 500;

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

/** One row as the Sheet holds it; `withheld` = the columns the store masked for this reader, with its reason. */
type ReadRowHidden = Record<string, HiddenFieldNotice>;

type GridRow = { id: string; data: Record<string, unknown>; withheld?: WithheldCells };

type Snapshot = {
  table: Dataset;
  fields: Field[];
  columns: DatasetField[];
  rows: GridRow[];
  /** The caller's level on the Table, from `custom.my_levels`. */
  level: string | null;
  /**
   * The hand-set order, when the Table's view keeps one (ORDER-FIX): it IS the Sheet's sort, so a
   * page read with no column sort comes back in it — on every page, not only within one.
   */
  handOrder: string[] | null;
  at: number;
};

const snapshots = new Map<string, Promise<ServiceResult<Snapshot>>>();

/** Drop what this browser holds for a table — after a write, or when the store says it moved. */
export function invalidateRecordStoreTable(tableId: string): void {
  snapshots.delete(tableId);
}

function asDataset(
  tableId: string,
  home: RecordStoreHome,
  document: Record<string, unknown>,
  level: string | null,
  extras: { metadata: Record<string, unknown>; rowOrdering: Record<string, unknown> | null },
): Dataset {
  const name = typeof document.name === "string" ? document.name : "";
  const description = typeof document.description === "string" ? document.description : null;
  const now = new Date().toISOString();
  return {
    id: tableId,
    table_name: name,
    description,
    organization_id: home.organizationId,
    // Ownership in the record store is a LEVEL on the Table, not a column on it.
    // The grid's edit gate reads `user_id === me` as "full rights" and asks
    // `hasEditorAccess` for everyone else, so a person whose level is `admin`
    // (the store's full-rights level) is handed as the owner here — the grid then
    // opens editable at once instead of flashing "Shared Table (read only)"
    // while the level is asked again. Any other level leaves it empty and the
    // edit gate asks `my_levels` (see service.ts `hasEditorAccess`).
    user_id: level === "admin" && home.userId ? home.userId : "",
    created_by: "",
    updated_by: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    is_public: false,
    // Every write to the record store is judged by the column's rules — there is
    // no permissive mode to switch off. The grid's Strict switch reads this.
    validation_mode: "strict",
    row_ordering_config: extras.rowOrdering as Dataset["row_ordering_config"],
    metadata: extras.metadata as Dataset["metadata"],
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
): Promise<ServiceResult<Array<{ id: string; document: Record<string, unknown>; hidden?: ReadRowHidden }>>> {
  const out: Array<{ id: string; document: Record<string, unknown>; hidden?: ReadRowHidden }> = [];
  // Until an EMPTY page: the door clamps the page size to its own, so a short
  // page is not proof of the end.
  for (let offset = 0; ; ) {
    const page = await client.list({ table_id: tableId, limit: READ_PAGE, offset });
    if (!page.ok) return refused(page.error);
    if (page.data.rows.length === 0) break;
    for (const row of page.data.rows) {
      out.push({ id: row.id, document: row.document as Record<string, unknown>, hidden: (row as { hidden?: ReadRowHidden }).hidden });
    }
    offset += page.data.rows.length;
    if (out.length > READ_CEILING) {
      return plainFailure(
        `This table has more than ${READ_CEILING.toLocaleString()} records, and this grid sorts, searches and counts them in your browser because the record store has no door that does it yet. Open it at /data-v2/${tableId}, which pages through the store instead.`,
      );
    }
  }
  return { success: true, data: out };
}

// ─── G13 + ORDER-FIX: the hand-set row order ─────────────────────────────────
//
// The older grid kept ONE hand-made order per table (`row_ordering_config = {enabled, order}`).
// The store keeps an order on a VIEW (G13, `platform.saved_view.metadata.record_positions`), and
// ORDER-FIX made it the ONE representation (Airtable's rule: a manual order is one of a view's
// sorts): a view is ordered by its sort OR by hand, never both — `definition.order = "manual"`
// means the positions are the view's sort; placing rows removes the view's `sorts`; a saved
// column sort (or `order: "sorted"`) replaces the hand order. The Table's own `row_order` word is
// NOT read: 786 tables on production say "manual" beside a saved sort, so it means nothing.
//
// So the Sheet's order is the Table's hand-ordered view (the oldest view whose definition says
// `order: "manual"`). When there is one, that order IS the Sheet's sort and the Table's saved sort
// is not handed on over it. Saving an order writes it on that view, else on the view that was
// hand-ordered before a sort replaced it, else on the Table's default view when that view IS the
// Sheet (`layout: "sheet"`); only a table with none of these gets a new view,
// on Save and never before, and it opens as the Sheet — the one layout that draws a hand-set
// order (the records-ui grid draws the table's sort, so a grid tab would lie). Where the doors are
// not on the database the capability is ABSENT (`hand_order` carries the store's sentence) and
// the Reorder control is not drawn — never a button that cannot save.

const HAND_ORDER_VIEW = "Hand-set order";

type HandOrder = StoreHandOrder & { viewId: string | null };
type ViewRow = { view_id: string; created_at: string; definition?: Record<string, unknown> | null };

async function tableViews(client: RecordsClient, tableId: string): Promise<ViewRow[]> {
  const views = await client.views({ table_id: tableId });
  if (!views.ok) return [];
  // `definition` is on every row the door answers (S0 one saved view); the installed client's
  // type predates it, so it is read as the door's own shape.
  return (views.data as unknown as ViewRow[])
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function manualViewId(views: readonly ViewRow[]): string | null {
  return views.find((v) => v.definition?.order === "manual")?.view_id ?? null;
}

/**
 * Where a Sheet order is saved when no view is hand-ordered now: the view that WAS (its sort
 * replaced the order; the store kept the positions, so the new order starts from them), else the
 * Table's default view when it IS the Sheet. Never a second "Hand-set order" view.
 */
function sheetOrderViewId(views: readonly ViewRow[]): string | null {
  return (
    views.find((v) => v.definition?.order === "sorted")?.view_id ??
    views.find((v) => v.definition?.is_default === true && v.definition?.layout === "sheet")?.view_id ??
    null
  );
}

async function readHandOrder(home: RecordStoreHome, client: RecordsClient, tableId: string): Promise<HandOrder> {
  const views = await tableViews(client, tableId);
  const viewId = manualViewId(views);
  if (!viewId) {
    // No hand-ordered view: does this store keep a hand-set order at all? The registry
    // (`custom.view_keys()`) says so, once per page load — never a probe that answers an error.
    const absent = await handOrderAbsence();
    if (absent) return { status: absent, enabled: false, order: [], viewId: null };
    return { status: "served", enabled: false, order: [], viewId: null };
  }
  const order: string[] = [];
  for (let offset = 0; ; ) {
    const page = await readRecordsInViewOrder(home, viewId, READ_PAGE, offset);
    if (!page.ok) return { status: page.error.message, enabled: false, order: [], viewId };
    if (page.data.length === 0) break;
    for (const row of page.data) if (row.position !== null && row.position !== undefined) order.push(row.id);
    offset += page.data.length;
    if (offset > READ_CEILING) break;
  }
  return { status: "served", enabled: true, order, viewId };
}

/**
 * Keep this hand-set order (it becomes the Sheet's sort), or stop using one (the Sheet goes back to
 * the Table's saved sort). Called only when the person SAVES — pressing Reorder writes nothing.
 */
export async function setRowOrdering(
  home: RecordStoreHome,
  args: { tableId: string; enabled: boolean; order: string[] },
): Promise<ServiceResult<null>> {
  const client = clientFor(home);
  const views = await tableViews(client, args.tableId);
  const manual = manualViewId(views);
  if (!args.enabled) {
    if (!manual) return { success: true, data: null };
    const off = await client.viewDeclare({ table_id: args.tableId, spec: { view_id: manual, definition: { order: "sorted" } } as never });
    invalidateRecordStoreTable(args.tableId);
    return off.ok ? { success: true, data: null } : refused(off.error);
  }
  let viewId = manual ?? sheetOrderViewId(views);
  if (!viewId) {
    const made = await client.viewDeclare({
      table_id: args.tableId,
      spec: { name: HAND_ORDER_VIEW, definition: { layout: "sheet" } },
    });
    if (!made.ok) return refused(made.error);
    viewId = made.data;
  }
  const kept = await viewRecordOrderSet(home, viewId, args.order);
  invalidateRecordStoreTable(args.tableId);
  return kept.ok ? { success: true, data: null } : refused(kept.error);
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
  const rows: GridRow[] = rowsRead.data.map((row) => {
    const withheld = withheldCells(row.hidden, fields);
    return { id: row.id, data: olderRowData(row.document, columns), ...(withheld ? { withheld } : {}) };
  });
  const level = levelRead.ok ? (levelRead.data.find((l) => l.id === tableId)?.level ?? null) : null;
  const document = tableRead.data.document as Record<string, unknown>;
  const [decorations, actions] = await Promise.all([
    client.tableDecorations({ table_id: tableId }),
    client.rowActions({ table_id: tableId }),
  ]);
  const metadata: Record<string, unknown> = {};
  // THE TABLE'S COLOURS, TRANSLATED BY THE ONE RESOLVER the grid, the kanban, the calendar and the
  // gallery read (records-ui `resolveTableStyle`); the Sheet has no view style of its own.
  if (decorations.ok) metadata.style = resolveTableStyle(decorations.data, fields, undefined);
  if (actions.ok) metadata.row_actions = olderRowActions(actions.data.actions, fields);
  const hand = await readHandOrder(home, client, tableId);
  const titleField = typeof document.title_field === "string" ? document.title_field : null;
  if (titleField && fields.some((f) => f.key === titleField)) {
    metadata.row_label = { kind: "field", field: titleField };
  }
  // What this grid cannot draw from the store, said once, where a reader of the
  // table's metadata (the settings panel, an agent) will find it.
  metadata.record_store = {
    colors: decorations.ok ? "served" : decorations.error.message,
    row_actions: actions.ok ? "served" : actions.error.message,
    hand_order: hand.status,
  };
  return {
    success: true,
    data: {
      table: asDataset(tableId, home, document, level ? String(level) : null, {
        metadata,
        rowOrdering: withHandOrder(olderRowOrdering(document.default_sort, fields), hand),
      }),
      fields,
      columns,
      rows,
      level: level ? String(level) : null,
      handOrder: hand.status === "served" && hand.enabled ? hand.order : null,
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

/** The placed rows first, in their order; the rest after them as the store read them. */
function inHandOrder(rows: readonly GridRow[], order: readonly string[]): GridRow[] {
  const place = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((row, i) => ({ row, i, p: place.get(row.id) }))
    .sort((a, b) => (a.p ?? Infinity) - (b.p ?? Infinity) || a.i - b.i)
    .map((x) => x.row);
}

function pageRows(
  snap: Snapshot,
  args: { sortField?: string | null; sortDirection?: "asc" | "desc"; searchTerm?: string | null },
): GridRow[] {
  let rows: GridRow[] = snap.handOrder && !args.sortField ? inHandOrder(snap.rows, snap.handOrder) : snap.rows;
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
  const client = clientFor(home);
  const answer = await client.tableList();
  if (!answer.ok) return refused(answer.error);
  const tables = answer.data.filter((t) => !t.is_kernel);
  // A REAL COUNT, never a zero (lane INTEG-CLIENTS). Every picker prints "N rows" and the
  // save-into dialog's Replace confirm says "permanently deletes all N rows": a store table
  // listed as 0 made that sentence a lie. `custom.table_capacity` counts a Table's live
  // records for a reader who may know the table. One call per Table — the store has no
  // "tables with their counts" door yet (named for GRID-PRIMITIVES).
  const counts = await Promise.all(tables.map((t) => client.tableCapacity({ table_id: t.id })));
  const failed = counts.find((c) => !c.ok);
  if (failed && !failed.ok) return refused(failed.error);
  return {
    success: true,
    data: tables.map((t, i) => {
      const count = counts[i];
      return {
        id: t.id,
        table_name: t.name,
        description: null,
        row_count: count && count.ok ? count.data.records : 0,
        field_count: Array.isArray(t.fields) ? t.fields.length : 0,
      };
    }),
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

/**
 * The words a page of relation cells reads, through the store's own door for
 * that column (`custom.relation_words_many` reads the column's display spec and
 * asks the ladder per record). An id the store answers nothing for is absent,
 * and the grid draws it as the amber identifier chip — never as a blank.
 */
export async function relationWords(
  home: RecordStoreHome,
  args: { tableId: string; fieldName: string; rowIds: readonly string[] },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (args.rowIds.length === 0) return out;
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return out;
  const column = columns.data.find((c) => c.field_name === args.fieldName);
  if (!column) return out;
  const answer = await clientFor(home).relationWordsMany({ field_id: column.id, record_ids: [...args.rowIds] });
  if (!answer.ok) return out;
  for (const [id, words] of Object.entries(answer.data)) {
    if (typeof words === "string") out.set(id, words);
  }
  return out;
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

// ─── the Table record's own settings, in the grid's words ───────────────────
//
// Colors (G1) and row actions (G2) point at Fields BY ID; the grid's older
// shapes point at them by MACHINE NAME. Both directions are translated here and
// nowhere else. A reference to a column that is gone was already dropped by the
// store's read door and named under `stale`.

function keyOf(fields: readonly Field[], id: string): string | null {
  return fields.find((f) => f.id === id)?.key ?? null;
}

function idOf(fields: readonly Field[], key: string): string | null {
  return fields.find((f) => f.key === key)?.id ?? null;
}

/** The older style path + value → the store's decoration path + value. Null = the path names a column that is gone. */
function storeDecorationWrite(
  path: readonly string[],
  value: unknown,
  fields: readonly Field[],
): { path: string[]; value: unknown } | null {
  const [head, a, b] = path;
  switch (head) {
    case "colorBy": {
      if (value === null) return { path: ["color_by"], value: null };
      const v = value as { field?: string; target?: string };
      const field = v?.field ? idOf(fields, v.field) : null;
      return field ? { path: ["color_by"], value: { field, target: v.target } } : null;
    }
    case "rules": {
      if (value === null) return { path: ["rules"], value: [] };
      const rules = Array.isArray(value) ? value : [];
      const mapped = [];
      for (const r of rules as Array<Record<string, unknown>>) {
        const field = typeof r.field === "string" ? idOf(fields, r.field) : null;
        if (!field) return null;
        mapped.push({ ...r, field });
      }
      return { path: ["rules"], value: mapped };
    }
    case "rows":
      return a ? { path: ["rows", a], value } : null;
    case "columns": {
      const field = a ? idOf(fields, a) : null;
      return field ? { path: ["columns", field], value } : null;
    }
    case "cells": {
      const field = b ? idOf(fields, b) : null;
      return a && field ? { path: ["cells", a, field], value } : null;
    }
    default:
      return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function olderRowActions(actions: readonly StoreRowAction[], fields: readonly Field[]): unknown[] {
  return actions.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    ...(a.color ? { color: a.color } : {}),
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.confirm ? { confirm: true } : {}),
    ...(a.kind === "agent" ? { prompt: a.prompt ?? "" } : {}),
    ...(a.kind === "update"
      ? {
          steps: (a.steps ?? []).flatMap((st) => {
            const field = keyOf(fields, st.field);
            if (!field) return [];
            if (st.set === "clear") return [{ field, set: "clear" }];
            if (st.set === "compute") return [{ field, set: "formula", expression: st.formula_text ?? "" }];
            return [{ field, set: "value", value: st.value }];
          }),
        }
      : {}),
  }));
}

function storeRowActions(actions: ReadonlyArray<Record<string, unknown>>, fields: readonly Field[]): unknown[] | string {
  const out: unknown[] = [];
  for (const a of actions) {
    const steps: unknown[] = [];
    for (const st of (Array.isArray(a.steps) ? a.steps : []) as Array<Record<string, unknown>>) {
      const field = typeof st.field === "string" ? idOf(fields, st.field) : null;
      if (!field) return `The action "${String(a.name)}" changes a column that is not in this table.`;
      if (st.set === "clear") steps.push({ field, set: "clear" });
      else if (st.set === "formula") steps.push({ field, set: "compute", formula_text: st.expression });
      else steps.push({ field, set: "value", value: st.value });
    }
    out.push({
      // The store keys a row action by uuid; an older id that is not one gets one.
      id: typeof a.id === "string" && UUID_RE.test(a.id) ? a.id : crypto.randomUUID(),
      name: a.name,
      kind: a.kind === "agent" ? "agent" : "update",
      ...(a.color ? { color: a.color } : {}),
      ...(a.icon ? { icon: a.icon } : {}),
      ...(a.confirm ? { confirm: true } : {}),
      ...(a.kind === "agent" ? { prompt: a.prompt } : { steps }),
    });
  }
  return out;
}

async function fieldsOf(home: RecordStoreHome, tableId: string): Promise<ServiceResult<Field[]>> {
  const snap = await snapshot(home, tableId);
  if (!snap.success) return snap;
  return { success: true, data: snap.data.fields };
}

function doorRefused(answer: { ok: false; error: RecordsError }): ServiceErr {
  return refused(answer.error);
}

// ─── table-level writes ─────────────────────────────────────────────────────

export async function setTableStyle(
  home: RecordStoreHome,
  args: { tableId: string; path: readonly string[]; value: unknown },
): Promise<ServiceResult<{ style: unknown }>> {
  const fields = await fieldsOf(home, args.tableId);
  if (!fields.success) return fields;
  const write = storeDecorationWrite(args.path, args.value ?? null, fields.data);
  if (!write) return plainFailure("That color points at a column this table no longer has. Nothing was saved.");
  const answer = await clientFor(home).tableDecorate({ table_id: args.tableId, path: write.path as DecorationPath, value: write.value });
  invalidateRecordStoreTable(args.tableId);
  if (!answer.ok) return doorRefused(answer);
  return { success: true, data: { style: resolveTableStyle(answer.data, fields.data, undefined) } };
}

export async function setTableRowActions(
  home: RecordStoreHome,
  args: { tableId: string; rowActions: ReadonlyArray<Record<string, unknown>> },
): Promise<ServiceResult<{ row_actions: unknown }>> {
  const fields = await fieldsOf(home, args.tableId);
  if (!fields.success) return fields;
  const mapped = storeRowActions(args.rowActions, fields.data);
  if (typeof mapped === "string") return plainFailure(`${mapped} Nothing was saved.`);
  const answer = await clientFor(home).actionDeclare({ table_id: args.tableId, actions: mapped as StoreRowAction[] });
  invalidateRecordStoreTable(args.tableId);
  if (!answer.ok) return doorRefused(answer);
  const read = await clientFor(home).rowActions({ table_id: args.tableId });
  return { success: true, data: { row_actions: read.ok ? olderRowActions(read.data.actions, fields.data) : mapped } };
}

/**
 * Run an update row action over a selection IN THE STORE (G2): one transaction,
 * the formula steps worked out by the store, the whole selection refused by
 * rule if any row is refused. Nothing is evaluated in the browser.
 */
export async function runRowAction(
  home: RecordStoreHome,
  args: { tableId: string; actionId: string; rowIds: readonly string[] },
): Promise<ServiceResult<{ changed: number }>> {
  const answer = await clientFor(home).actionRun({ action_id: args.actionId, record_ids: [...args.rowIds] });
  invalidateRecordStoreTable(args.tableId);
  if (!answer.ok) {
    // A run any record refused changed NOTHING; name every record and field that refused.
    const refusals = actionRefusals(answer.error);
    if (refusals.length === 0) return doorRefused(answer);
    const said = refusals
      .slice(0, 3)
      .map((r) => `${r.record ?? "a row"}${r.field ? ` (${r.field})` : ""}: ${r.says}`)
      .join("; ");
    return { ...refused(answer.error), error: `${said}${refusals.length > 3 ? ` — and ${refusals.length - 3} more` : ""}` };
  }
  const changed = typeof answer.data?.ran === "number" ? answer.data.ran : args.rowIds.length;
  return { success: true, data: { changed } };
}

export async function setTableRowLabel(
  home: RecordStoreHome,
  args: { tableId: string; rowLabel: { kind: string; field?: string; expression?: string } | null },
): Promise<ServiceResult<{ row_label: unknown }>> {
  if (args.rowLabel && args.rowLabel.kind !== "field") {
    return plainFailure(
      "A record-store table names its rows by one of its columns; a label worked out by a formula is not something it keeps yet. Pick a column instead.",
    );
  }
  if (args.rowLabel?.field) {
    // The store names a record by the words a column HOLDS (`custom._words_for` reads the
    // title column off the record); a worked-out column holds none, so every row would fall
    // back to some other words while the grid said the label was set.
    const fields = await fieldsOf(home, args.tableId);
    if (!fields.success) return fields;
    const picked = fields.data.find((f) => f.key === args.rowLabel!.field);
    if (picked && String(picked.type) === "formula") {
      return plainFailure(
        `"${picked.label || picked.key}" is worked out by the table, and a record-store table names its rows by a column that holds its own words. Pick a column people fill in. Nothing was changed.`,
      );
    }
  }
  const client = clientFor(home);
  const written = await client.recordUpdate({
    record_id: args.tableId,
    patch: { title_field: args.rowLabel?.field ?? null },
  });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: { row_label: args.rowLabel } };
}

export async function updateTableMetadata(
  home: RecordStoreHome,
  args: { tableId: string; tableName?: string; description?: string; isPublic?: boolean },
): Promise<ServiceResult<{ id: string; table_name: string; description: string | null; version: number | null; is_public: boolean | null; updated_at: string }>> {
  if (args.isPublic !== undefined) {
    return plainFailure(
      "A record-store table is shared by the Share button, person by person or with the organization — it has no public switch. Nothing was changed.",
    );
  }
  const patch: Record<string, unknown> = {};
  if (args.tableName !== undefined) patch.name = args.tableName;
  if (args.description !== undefined) patch.description = args.description;
  const written = await clientFor(home).recordUpdate({ record_id: args.tableId, patch });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  const snap = await snapshot(home, args.tableId, true);
  return {
    success: true,
    data: {
      id: args.tableId,
      table_name: snap.success ? snap.data.table.table_name : (args.tableName ?? ""),
      description: snap.success ? snap.data.table.description : (args.description ?? null),
      version: written.data,
      is_public: false,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function setDefaultSort(
  home: RecordStoreHome,
  args: { tableId: string; sortField?: string; sortDirection?: "asc" | "desc" },
): Promise<ServiceResult<null>> {
  const value = storeDefaultSort(args.sortField, args.sortDirection);
  const client = clientFor(home);
  // ORDER-FIX: saving a column sort REPLACES a hand-set order (Airtable's rule). The store flips the
  // hand-ordered view to sorted when it is given a sort; its positions stay, so the next Save of an
  // order starts from the one last kept.
  if (value.length > 0) {
    const manual = manualViewId(await tableViews(client, args.tableId));
    if (manual) {
      const replaced = await client.viewDeclare({ table_id: args.tableId, spec: { view_id: manual, definition: { sorts: value } } as never });
      if (!replaced.ok) {
        invalidateRecordStoreTable(args.tableId);
        return refused(replaced.error);
      }
    }
  }
  const written = await client.recordUpdate({ record_id: args.tableId, patch: { default_sort: value } });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: null };
}

// ─── column writes ──────────────────────────────────────────────────────────

async function fieldById(home: RecordStoreHome, tableId: string, fieldId: string): Promise<ServiceResult<Field>> {
  const fields = await fieldsOf(home, tableId);
  if (!fields.success) return fields;
  const field = fields.data.find((f) => f.id === fieldId);
  return field ? { success: true, data: field } : plainFailure("That column is no longer part of this table.");
}

export async function renameColumn(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; newName: string },
): Promise<ServiceResult<{ formulasUpdated: string[]; formulasFailed: string[] }>> {
  // A store formula points at its columns BY ID, so renaming one breaks no formula
  // and none has to be rewritten; the store keeps each formula's text in step.
  const written = await clientFor(home).fieldUpdate({ field_id: args.fieldId, patch: { label: args.newName } as never });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: { formulasUpdated: [], formulasFailed: [] } };
}

export async function renumberFields(
  home: RecordStoreHome,
  args: { tableId: string; updates: { id: string; field_order: number }[] },
): Promise<ServiceResult<{ updated: number }>> {
  const client = clientFor(home);
  for (const u of args.updates) {
    const written = await client.fieldUpdate({ field_id: u.id, patch: { sort: u.field_order } as never });
    if (!written.ok) {
      invalidateRecordStoreTable(args.tableId);
      return refused(written.error);
    }
  }
  invalidateRecordStoreTable(args.tableId);
  return { success: true, data: { updated: args.updates.length } };
}

export async function deleteField(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string },
): Promise<ServiceResult<{ table_id: string; field_id: string; field_name: string; display_name: string; rows_cleared: number }>> {
  const field = await fieldById(home, args.tableId, args.fieldId);
  if (!field.success) return field;
  const retired = await clientFor(home).fieldRetire({ field_id: args.fieldId });
  invalidateRecordStoreTable(args.tableId);
  if (!retired.ok) return refused(retired.error);
  return {
    success: true,
    data: {
      table_id: args.tableId,
      field_id: args.fieldId,
      field_name: field.data.key,
      display_name: field.data.label,
      // The store retires the column; every value stays on its record, in history.
      rows_cleared: 0,
    },
  };
}

export async function setFieldFormat(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; format: FieldFormatConfig | null },
): Promise<ServiceResult<{ field_id: string }>> {
  const field = await fieldById(home, args.tableId, args.fieldId);
  if (!field.success) return field;
  const client = clientFor(home);
  // SEAM HONESTY: every option of the format is carried through `custom.field_update` or the
  // whole save is refused before anything is written (record-store-shape.ts `storeFormatWrite`).
  let current: { choices: FieldChoice[] | null; optionsKeyedByName: boolean } = { choices: null, optionsKeyedByName: false };
  if (String(field.data.type) === "list") {
    const options = await client.fieldOptions({ field_id: args.fieldId });
    if (!options.ok) return refused(options.error);
    const docs = options.data.map((o) => ((o as { data?: Record<string, unknown> | null }).data ?? {}));
    current = {
      choices: options.data
        .map((option) => choiceFromOption(option as { data?: Record<string, unknown> | null }))
        .filter((c): c is FieldChoice => c !== null),
      optionsKeyedByName: docs.some((d) => typeof d.name === "string" && typeof d.title !== "string"),
    };
  }
  const write = storeFormatWrite(field.data, args.format, current);
  if (!write.ok) return plainFailure(write.says);
  for (const [i, patch] of write.patches.entries()) {
    const written = await client.fieldUpdate({ field_id: args.fieldId, patch: patch as never });
    if (!written.ok) {
      invalidateRecordStoreTable(args.tableId);
      if (i === 0) return refused(written.error);
      // A later patch refused after an earlier one landed: said, never reported as saved.
      return plainFailure(
        `Part of this column's settings was saved, but the rest was refused: ${written.error.message} Open the column's settings again to see what it holds now.`,
      );
    }
  }
  invalidateRecordStoreTable(args.tableId);
  if (args.format?.id === "autonumber") {
    const numbered = await clientFor(home).autonumberBackfill({ field_id: args.fieldId });
    if (!numbered.ok) {
      return plainFailure(
        `The column was set to Autonumber, but the existing rows could not be numbered: ${numbered.error.message}`,
      );
    }
  }
  return { success: true, data: { field_id: args.fieldId } };
}

export async function backfillAutonumber(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string },
): Promise<ServiceResult<{ numbered: number; highest: number }>> {
  const answer = await clientFor(home).autonumberBackfill({ field_id: args.fieldId });
  invalidateRecordStoreTable(args.tableId);
  if (!answer.ok) return doorRefused(answer);
  const numbered = answer.data.numbered ?? 0;
  const highest = answer.data.highest ?? 0;
  return { success: true, data: { numbered, highest } };
}

/** The older storage type the grid asks for → the store's kind word (`field_update` type). */
const KIND_FOR_TYPE: Partial<Record<string, string>> = {
  string: "text",
  number: "number",
  integer: "number",
  boolean: "checkbox",
  datetime: "datetime",
};

export async function changeFieldType(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; newType: string },
): Promise<ServiceResult<{ field_id: string; new_type: string; strategy: string; rows_rewritten: number; rows_skipped: number; rows_total: number; values_emptied: number }>> {
  const kind = KIND_FOR_TYPE[args.newType];
  if (!kind) {
    return plainFailure(
      args.newType === "date"
        ? "The record store keeps a day as a date-and-time column; choose Date & time. Nothing was changed."
        : `The record store has no "${args.newType}" kind of column to change this one into. Nothing was changed.`,
    );
  }
  // FLD-4 / T12: the store converts what converts and keeps what does not in
  // `_retired`, with the reason — neither coerced nor deleted.
  const behaviour = kind === "text" ? "text" : kind === "checkbox" ? "boolean" : "range";
  const retyped = await migrateRetype(home, args.fieldId, behaviour);
  if (!retyped.ok) {
    invalidateRecordStoreTable(args.tableId);
    return doorRefused(retyped);
  }
  if (kind === "datetime" || args.newType === "integer") {
    const shaped = await clientFor(home).fieldUpdate({
      field_id: args.fieldId,
      patch: (kind === "datetime" ? { type: "datetime" } : { display_format: { id: "integer" } }) as never,
    });
    if (!shaped.ok) {
      invalidateRecordStoreTable(args.tableId);
      return refused(shaped.error);
    }
  }
  invalidateRecordStoreTable(args.tableId);
  const kept = retyped.data?.values_in_retired_for_this_field ?? 0;
  const holding = retyped.data?.records_still_holding_a_value ?? 0;
  return {
    success: true,
    data: {
      field_id: args.fieldId,
      new_type: args.newType,
      strategy: "cast_or_null",
      rows_rewritten: holding,
      rows_skipped: 0,
      rows_total: holding + kept,
      values_emptied: kept,
    },
  };
}

/** The shape of every column over every row this person may see — computed from the one read. */
export async function getTableProfile(
  home: RecordStoreHome,
  args: { tableId: string; previewValues?: number },
): Promise<ServiceResult<{ table_id: string; total_rows: number; columns: unknown[] }>> {
  const snap = await snapshot(home, args.tableId);
  if (!snap.success) return snap;
  const columns: unknown[] = [];
  for (const c of snap.data.columns) {
    const facets = await getColumnFacets(home, { tableId: args.tableId, fieldName: c.field_name, limit: args.previewValues ?? 12 });
    if (!facets.success) return facets;
    let numeric = 0;
    let url = 0;
    let email = 0;
    let bool = 0;
    for (const row of snap.data.rows) {
      const raw = row.data[c.field_name];
      if (raw === null || raw === undefined) continue;
      const text = (typeof raw === "string" ? raw : jsonbText(raw)).trim();
      if (text === "") continue;
      if (/^-?[0-9]+(\.[0-9]+)?$/.test(text)) numeric += 1;
      if (/^https?:\/\/\S+$/i.test(text)) url += 1;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) email += 1;
      if (/^(true|false|yes|no)$/i.test(text)) bool += 1;
    }
    columns.push({
      field_name: c.field_name,
      display_name: c.display_name,
      data_type: c.data_type,
      is_required: c.is_required,
      format: ((c.metadata ?? {}) as { format?: FieldFormatConfig }).format ?? null,
      looks_numeric: numeric,
      looks_url: url,
      looks_email: email,
      looks_bool: bool,
      filled: facets.data.filled,
      blank: facets.data.blank,
      distinct_count: facets.data.distinct_count,
      max_length: facets.data.max_length,
      top_values: facets.data.values,
    });
  }
  return { success: true, data: { table_id: args.tableId, total_rows: snap.data.rows.length, columns } };
}

/** Exactly these rows, read again through the store's id door (the same ladder as a page). */
export async function rowsById(
  home: RecordStoreHome,
  args: { tableId: string; rowIds: readonly string[] },
): Promise<ServiceResult<GridRow[]>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const read = await clientFor(home).listByIds({ table_id: args.tableId, ids: args.rowIds });
  if (!read.ok) return refused(read.error);
  return {
    success: true,
    data: read.data.map((r) => ({ id: r.id, data: olderRowData(r.document as Record<string, unknown>, columns.data) })),
  };
}

// ─── history ────────────────────────────────────────────────────────────────
//
// The older grid's history panel reads `udt_dataset_row_versions`: one row per
// change carrying the WHOLE row after (`data`) and before (`prior_data`). The
// store keeps each version as the fields that moved, with before and after —
// so the whole-row snapshots are rebuilt here, oldest to newest, from exactly
// what the store recorded. Nothing is guessed: a key the store never recorded
// is absent from the snapshot, as it was absent from the record.

export type StoreRowVersion = {
  id: number;
  row_id: string;
  table_id: string;
  change_kind: "insert" | "update" | "delete";
  changed_at: string;
  changed_by: string | null;
  data: Record<string, unknown> | null;
  prior_data: Record<string, unknown> | null;
  reason: string | null;
  custom_fields: Record<string, unknown>;
};

function changeKindOf(operation: string): StoreRowVersion["change_kind"] {
  const word = operation.toLowerCase();
  if (word === "insert" || word === "create" || word === "created") return "insert";
  if (word.includes("archive") || word.includes("delete")) return "delete";
  return "update";
}

export async function rowHistory(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; limit: number },
): Promise<ServiceResult<StoreRowVersion[]>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  // Every version, so each snapshot can be rebuilt from the first; `limit` is
  // applied to what is shown, newest first.
  const entries: RecordHistoryEntry[] = [];
  for (let offset = 0; offset < 5000; offset += HISTORY_PAGE) {
    const read = await clientFor(home).recordHistory({ record_id: args.rowId, limit: HISTORY_PAGE, offset });
    if (!read.ok) return refused(read.error);
    entries.push(...read.data);
    if (read.data.length < HISTORY_PAGE) break;
  }
  const oldestFirst = [...entries].sort((a, b) => a.version - b.version);
  let current: Record<string, unknown> = {};
  const out: StoreRowVersion[] = [];
  for (const entry of oldestFirst) {
    const prior = { ...current };
    const kind = changeKindOf(entry.operation);
    for (const change of entry.changes) {
      if (change.after === null || change.after === undefined) delete current[change.key];
      else current[change.key] = change.after;
    }
    out.push({
      id: entry.version,
      row_id: args.rowId,
      table_id: args.tableId,
      change_kind: kind,
      changed_at: entry.occurred_at,
      changed_by: entry.actor?.user_id ?? null,
      data: kind === "delete" ? null : olderRowData({ ...current }, columns.data),
      prior_data: kind === "insert" ? null : olderRowData(prior, columns.data),
      reason: entry.operation_label ?? null,
      custom_fields: {},
    });
  }
  return { success: true, data: out.reverse().slice(0, args.limit) };
}

/** The store's own verb: the whole record back to a version, as a NEW version. */
export async function restoreRowVersion(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; version: number },
): Promise<ServiceResult<null>> {
  const done = await clientFor(home).restoreVersion({ record_id: args.rowId, version: args.version });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: null };
}

/** One column back to what it said at a version, as a NEW version (HIS-N-2). */
export async function revertRowField(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; fieldName: string; version: number },
): Promise<ServiceResult<null>> {
  const done = await clientFor(home).valueRestore({ record_id: args.rowId, field_key: args.fieldName, version: args.version });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: null };
}

/** An archived row back, under its OWN id (REC-23) — nothing is re-inserted. */
export async function restoreArchivedRow(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string },
): Promise<ServiceResult<null>> {
  const done = await clientFor(home).recordRestore({ record_id: args.rowId });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: null };
}

// ─── table settings: the older `update_user_table_config` shape ─────────────

/** The column settings this seam carries (`update_user_table_config`'s field keys it has a door for). */
const FIELD_SETTINGS_CARRIED = new Set(["id", "display_name", "field_order", "is_required", "validation_rules", "field_name", "default_value"]);
/** The table settings it carries. */
const TABLE_SETTINGS_CARRIED = new Set(["table_name", "description"]);

export async function updateTableConfig(
  home: RecordStoreHome,
  args: {
    tableId: string;
    tableUpdates?: Record<string, unknown>;
    fieldUpdates?: Array<Record<string, unknown> & { id: string }>;
  },
): Promise<ServiceResult<null>> {
  const table = args.tableUpdates ?? {};
  // SEAM HONESTY: every setting is judged BEFORE anything is written, so a refusal means
  // nothing changed — never "the name saved and the rest vanished".
  const tableUnknown = Object.keys(table).filter((k) => table[k] !== undefined && !TABLE_SETTINGS_CARRIED.has(k));
  if (tableUnknown.length) {
    return plainFailure(
      tableUnknown.includes("is_public")
        ? "A record-store table is shared by the Share button, person by person or with the organization — it has no public switch. Nothing was changed."
        : `The record store has nowhere to keep this table's ${tableUnknown.map((k) => `"${k}"`).join(" or ")} setting. Nothing was changed.`,
    );
  }
  const updates = args.fieldUpdates ?? [];
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  if (updates.length) {
    const fields = await fieldsOf(home, args.tableId);
    if (!fields.success) return fields;
    for (const update of updates) {
      const field = fields.data.find((f) => f.id === update.id);
      if (!field) return plainFailure("That column is no longer part of this table. Nothing was changed.");
      const name = field.label || field.key;
      const unknown = Object.keys(update).filter((k) => update[k] !== undefined && !FIELD_SETTINGS_CARRIED.has(k));
      if (unknown.length) {
        return plainFailure(
          unknown.includes("is_public")
            ? `A record-store column is shared with its table; "${name}" has no public switch of its own. Nothing was changed.`
            : `The record store has nowhere to keep ${unknown.map((k) => `"${k}"`).join(" or ")} on "${name}". Nothing was changed.`,
        );
      }
      if (typeof update.field_name === "string" && update.field_name !== field.key) {
        return plainFailure(
          `"${name}" keeps the machine name it was made with (${field.key}), because its rows, formulas and rules point at it. Rename what people read — the column's name — instead. Nothing was changed.`,
        );
      }
      if (update.default_value !== undefined) {
        return plainFailure("A record-store column has no default value to set. Nothing about this column was changed.");
      }
      const patch: Record<string, unknown> = {};
      if (typeof update.display_name === "string") patch.label = update.display_name;
      if (typeof update.field_order === "number") patch.sort = update.field_order;
      if (typeof update.is_required === "boolean") patch.required = update.is_required;
      if (update.validation_rules !== undefined) {
        const mapped = storeRulesFromOlder(
          (update.validation_rules ?? {}) as Record<string, unknown>,
          field.rules as unknown as Array<Record<string, unknown>>,
        );
        if (mapped.refused.length) {
          return plainFailure(
            `The record store checks a smallest or largest number, a pattern, a shortest and a longest length and "no two rows the same"; it cannot keep ${mapped.refused.join(" or ")} on "${name}" yet. Nothing was changed.`,
          );
        }
        patch.rules = mapped.rules;
        // The older rule object is the whole set, so a missing `unique` means OFF.
        if (mapped.unique !== ((field as { unique?: boolean | null }).unique === true)) patch.unique = mapped.unique;
      }
      if (Object.keys(patch).length > 0) patches.push({ id: update.id, patch });
    }
  }
  if (table.table_name !== undefined || table.description !== undefined) {
    const t = await updateTableMetadata(home, {
      tableId: args.tableId,
      ...(typeof table.table_name === "string" ? { tableName: table.table_name } : {}),
      ...(typeof table.description === "string" ? { description: table.description } : {}),
    });
    if (!t.success) return t;
  }
  const client = clientFor(home);
  for (const { id, patch } of patches) {
    const written = await client.fieldUpdate({ field_id: id, patch: patch as never });
    if (!written.ok) {
      invalidateRecordStoreTable(args.tableId);
      return refused(written.error);
    }
  }
  invalidateRecordStoreTable(args.tableId);
  return { success: true, data: null };
}

// ─── add a column ───────────────────────────────────────────────────────────

/** The older storage type an Add Column form picks → a new store Field's spec. */
function specForNewColumn(dataType: string): Record<string, unknown> | null {
  switch (dataType) {
    case "string":
      return { type: "text" };
    case "number":
      return { type: "number" };
    case "integer":
      return { type: "number", display_format: { id: "integer" } };
    case "boolean":
      return { type: "checkbox" };
    case "date":
      return { type: "datetime" };
    case "json":
      return { plain: "text", display_format: { id: "json" } };
    case "array":
      return { type: "text", multi: true };
    default:
      return null;
  }
}

export async function addColumn(
  home: RecordStoreHome,
  args: {
    tableId: string;
    fieldName: string;
    displayName: string;
    dataType: string;
    isRequired: boolean;
    defaultValue?: string | number | boolean | null;
    fieldOrder?: number;
  },
): Promise<{ success: boolean; columnId?: string; error?: string }> {
  if (args.defaultValue !== undefined && args.defaultValue !== null && args.defaultValue !== "") {
    return { success: false, error: "A record-store column has no default value. Leave it empty and fill the rows you need." };
  }
  const spec = specForNewColumn(args.dataType);
  if (!spec) return { success: false, error: `The record store has no "${args.dataType}" kind of column.` };
  const made = await clientFor(home).fieldDeclare({
    table_id: args.tableId,
    spec: {
      label: args.displayName,
      key: args.fieldName,
      required: args.isRequired,
      ...(typeof args.fieldOrder === "number" ? { sort: args.fieldOrder } : {}),
      ...spec,
    } as never,
  });
  invalidateRecordStoreTable(args.tableId);
  if (!made.ok) return { success: false, error: made.error.message };
  return { success: true, columnId: made.data };
}

// ─── a table born outside the grid (lane INTEG-CLIENTS) ─────────────────────

/** The older storage type a "save as a table" caller names → the store's word for the column. */
function newFieldTypeFor(dataType: string): Pick<NewFieldSpec, "type" | "multi" | "config"> {
  switch (dataType) {
    case "number":
    case "integer":
      return { type: "number" };
    case "boolean":
      return { type: "checkbox" };
    case "date":
    case "datetime":
      return { type: "datetime" };
    case "json":
      return { type: "long_text" };
    case "array":
      return { type: "text", multi: true };
    default:
      return { type: "text" };
  }
}

/**
 * Make a NEW Table in the record store with its columns, through `declareTable` — the
 * records-ui primitive the /data-v2 "New table" button uses, so a table saved from a chat
 * answer and a table made on the tables page are the same kind of thing. The older
 * `description` is written onto the Table record afterwards (the declaration has no slot);
 * a table whose description was refused is still made and says so in `warning`.
 */
export async function createTable(
  home: RecordStoreHome,
  args: {
    tableName: string;
    description?: string;
    fields: Array<{ field_name: string; display_name: string; data_type: string; field_order: number; is_required: boolean }>;
  },
): Promise<{ success: boolean; tableId?: string; error?: string; warning?: string }> {
  const client = clientFor(home);
  const fields: NewFieldSpec[] = [...args.fields]
    .sort((a, b) => a.field_order - b.field_order)
    .map((f, i) => ({
      key: f.field_name,
      label: f.display_name || f.field_name,
      sort: (i + 1) * 100,
      // A title a person must fill before a record may exist would refuse every paste of a
      // row with an empty first cell; `declareTable` explains why the first field is never
      // demanded (records-ui DEFAULT_FIELDS). An organization demands it in the field editor.
      required: false,
      ...newFieldTypeFor(f.data_type),
    }));
  const declared = await declareTable(client, {
    name: args.tableName,
    ...(fields.length > 0 ? { fields, titleField: fields[0]!.key } : {}),
  });
  if (!declared.ok) return { success: false, error: declared.error.message };
  const warnings: string[] = [];
  // SEAM HONESTY: every column is made optional (above); a caller that asked for a required one
  // is told so, never left believing the store will demand it.
  const asked = args.fields.filter((f) => f.is_required).map((f) => f.display_name || f.field_name);
  if (asked.length) {
    warnings.push(
      `${asked.map((n) => `"${n}"`).join(", ")} ${asked.length === 1 ? "was" : "were"} made optional: a new record-store table demands no column until someone marks it required in the column's settings.`,
    );
  }
  if (args.description && args.description.trim()) {
    const described = await client.recordUpdate({ record_id: declared.data, patch: { description: args.description.trim() } });
    if (!described.ok) warnings.push(`The table was made, but its description was not saved: ${described.error.message}`);
  }
  const warning = warnings.length ? warnings.join(" ") : undefined;
  return { success: true, tableId: declared.data, ...(warning ? { warning } : {}) };
}

/** The Add Row form's column list: this table's columns as the store holds them. */
export async function tableDetails(
  home: RecordStoreHome,
  tableId: string,
): Promise<{ success: boolean; table?: { id: string; name: string; description: string; is_public: boolean }; fields?: DatasetField[]; error?: string }> {
  const snap = await snapshot(home, tableId, true);
  if (!snap.success) return { success: false, error: snap.error };
  return {
    success: true,
    table: { id: tableId, name: snap.data.table.table_name, description: snap.data.table.description ?? "", is_public: false },
    fields: snap.data.columns,
  };
}

/**
 * The layout a record-store table's grid opens with (G1): the platform's value,
 * then the organization's `custom/grid_layout` knob — the store's twin of the
 * older `extensibility/user_tables.*` knobs, answered by `custom.grid_layout`.
 */
export async function gridLayoutDefaults(
  home: RecordStoreHome,
  tableId: string,
): Promise<{ layout: string; fitMaxColumns: number; rowHeight: string } | null> {
  const answer = await clientFor(home).gridLayout({ table_id: tableId });
  if (!answer.ok) return null;
  const l = answer.data.layout;
  return { layout: l.mode, fitMaxColumns: l.fit_max_columns, rowHeight: l.row_height };
}
