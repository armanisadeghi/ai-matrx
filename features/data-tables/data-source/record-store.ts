// features/data-tables/data-source/record-store.ts — THE GRID'S DATA SEAM, OVER THE RECORD STORE.
//
// The implementation of the interface `service.ts` exports. Every call carries the
// table's home (`table-home.ts`): its organization and the reader.
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
//   sort / search / count       The store's page door, `custom.read_records_page`
//                               (DOOR-SPEED, 2026-09-25): ONE call per page, sorted,
//                               searched and counted by the store over what this
//                               person may see — never the whole table in the
//                               browser, and no row ceiling.
//   a bulk write in one txn     The store's many-changes door,
//                               `custom.record_change_many`: every insert, update and
//                               archive of one grid action in ONE call and ONE
//                               transaction. A refused change refuses the batch and
//                               nothing is saved; the store's sentence names it.
//
// WHAT IS CACHED: the table's METADATA (declaration, fields, level, colours, row
// actions, hand-set order) — until a write that changes it, or the realtime port
// says the shape moved. Rows are never cached here: the grid holds its page, a
// cell write patches it from the write's own answer, and nothing is re-read.

import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { actionRefusals, mintOpId, type ChoiceRehome, type ChoicesRehomed, type ChoiceUsage } from "@ai-matrx/records";
import type {
  DecorationPath,
  Field,
  ReadRow,
  RecordPageSort,
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
import {
  handOrderAbsence,
  migrateRetype,
  readRecordsInViewOrder,
  viewRecordOrderSet,
  recordUpdateAddingChoices,
} from "./record-store-grid";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import {
  choiceFromOption,
  jsonbText,
  liveOptionsInOrder,
  lookFitsKind,
  gridColumnFromField,
  gridRowData,
  gridRowOrdering,
  storeDefaultSort,
  storeFormatWrite,
  storeRulesFromOlder,
  storeValue,
  withHandOrder,
  type StoreChoice,
  type StoreHandOrder,
} from "./record-store-shape";
import { readAllRows } from "@ai-matrx/data/db";
import { VersionLedger, changeRecordsAt, restoreAt, updateRecordAt, versionUnread, type VersionedChange } from "@/lib/records/record-versions";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * One page of a read that genuinely needs every row (export, the column filter's values): the
 * store's page ceiling (PAGE-1: `custom.page_ceiling` answers 1000 unless an organization raised
 * it). Every page is its own call; there is no row ceiling.
 */
const READ_PAGE = 1_000;
/**
 * How long a table's METADATA is trusted without being told it moved. Every write that changes
 * it drops it at once, and the realtime port drops it when another browser changes the shape, so
 * this is only the backstop for a browser that is not listening.
 */
const META_TTL_MS = 5 * 60_000;
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

// ─── the versions the person saw ─────────────────────────────────────────────
//
// EVERY UPDATE CARRIES THE VERSION THE PERSON SAW (lane 10 VWF). The read doors answer documents,
// never versions, so every read that DRAWS rows (a page, rows by id, a whole-table read) reads their
// headers once, in the background; a write waits for that read and sends the version it found. A
// version that could not be read refuses the write ("Could not check for changes") — never sent as
// "no version", which the store treats as last-write-wins.
const versions = new VersionLedger();

/** The version this browser drew a row at (`null` = unread). Exported for screens that show the seam's rows. */
export function seenRowVersion(rowId: string): Promise<number | null> {
  return versions.seen(rowId);
}

/**
 * THIS BROWSER'S OWN WRITES TO ONE RECORD GO ONE AFTER ANOTHER (grids review 3, found on the re-walk).
 * Measured on the clone: "+ Row", then Title, Tab, Asset Tag, Tab… typed fast — the Title's update
 * (expected version 1 → 2) was still in flight when the Asset Tag's left, also against version 1, and
 * the store refused it PT409 "Changed by someone else". The someone else was the same person, one
 * cell to the left. Each update of a record now waits for this browser's previous update of that
 * record to land, then is sent against the version that write raised — a colleague's change is
 * still refused exactly as before.
 */
const ownWrites = new Map<string, Promise<unknown>>();
function afterOwnWrites<T>(rowId: string, write: () => Promise<T>): Promise<T> {
  const before = ownWrites.get(rowId) ?? Promise.resolve();
  const next = before.catch(() => undefined).then(write);
  ownWrites.set(rowId, next);
  void next.finally(() => {
    if (ownWrites.get(rowId) === next) ownWrites.delete(rowId);
  });
  return next;
}

/** The version a write is sent against: the caller's own (an undo's), else the one the rows were drawn at. */
async function versionFor(rowId: string, own: number | null | undefined): Promise<number | null> {
  return own !== undefined ? own : versions.seen(rowId);
}

/**
 * A CALL THE STORE CUT OFF AT ITS CLOCK CHANGED NOTHING, AND SAYS SO (lane CHAIR-STORE-PERF, 2026-10-03).
 *
 * Postgres cancels the whole statement at the authenticated clock (8 s), so a door that timed out
 * wrote nothing — a fact, for a create, a column add and a page read alike. The store's own words for
 * it are a machine's ("canceling statement due to statement timeout"), and the package's fallback
 * remedy for the code was written for a page read ("Try a smaller page") — which is what a person
 * adding ONE row to a three-row table read on the clone walk. Measured there, the clock was hit by a
 * lock another lane's rehearsal held on auth.users, not by the door's own work (field_declare 180-500
 * ms, record_write 150-200 ms when the lock is free). So the seam says what is true in a person's
 * sentence, and hands the remedy as the HINT — the slot records-ui prints as the one remedy.
 */
function clockSentence(error: RecordsError): RecordsError {
  if (error.code !== "timed_out") return error;
  return {
    ...error,
    message: "The store took too long to answer, so nothing was changed.",
    hint: "Try again in a moment.",
  };
}

function refused(error: RecordsError): ServiceErr {
  const said = clockSentence(error);
  return { success: false, error: said.message, refusal: said };
}

function plainFailure(message: string): ServiceErr {
  return { success: false, error: message };
}

// ─── the snapshot: one table, read once per question ────────────────────────

/** One row as the Sheet holds it; `withheld` = the columns the store masked for this reader, with its reason. */
type GridRow = { id: string; data: Record<string, unknown>; withheld?: WithheldCells };

type Snapshot = {
  table: Dataset;
  fields: Field[];
  columns: DatasetField[];
  /** How many records this person may see (`custom.table_capacity`) — never a length of a read. */
  rowCount: number;
  /** The caller's level on the Table, from `custom.my_levels`. */
  level: string | null;
  /**
   * The hand-set order, when the Table's view keeps one (ORDER-FIX): it IS the Sheet's sort, so a
   * page read with no column sort comes back in it — on every page, not only within one. The page
   * door reads it from `handViewId` itself; the id list is what the grid's Reorder draws.
   */
  handOrder: string[] | null;
  handViewId: string | null;
  at: number;
};

const snapshots = new Map<string, Promise<ServiceResult<Snapshot>>>();

/**
 * Drop the METADATA this browser holds for a table — after a write that changes the table's
 * shape, settings or order, or when the store says the shape moved. A row write never calls this:
 * rows are not cached, and re-reading the table's declaration after every cell was the Sheet's
 * three-second edit (v2 readiness audit, 2026-09-25).
 */
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
    shown_to: "only_me",
    published_to_web: false,
    published_to_web_at: null,
    published_to_web_by: null,
    workbook_id: null,
  } as Dataset;
}

async function choicesFor(client: RecordsClient, field: Field): Promise<FieldChoice[] | null> {
  if (String(field.type) !== "list") return null;
  const options = await client.fieldOptions({ field_id: field.id });
  if (!options.ok) return null;
  return liveOptionsInOrder(options.data)
    .map((option) => choiceFromOption(option as { id?: unknown; data?: Record<string, unknown> | null }))
    .filter((c): c is FieldChoice => c !== null);
}

/** The page door's sort for the grid's column sort (by machine name or header). */
function pageSort(
  columns: readonly DatasetField[],
  sortField: string | null | undefined,
  sortDirection: "asc" | "desc" | undefined,
): RecordPageSort[] {
  if (!sortField) return [];
  const column = columns.find((c) => c.field_name === sortField || c.display_name === sortField);
  if (!column) return [];
  const t = String(column.data_type);
  const as = t === "number" || t === "integer" ? "number" : t === "date" || t === "datetime" ? "date" : "text";
  return [{ field: column.field_name, direction: sortDirection === "desc" ? "desc" : "asc", as }];
}

function gridRowsOf(rows: readonly ReadRow[], snap: Snapshot): GridRow[] {
  return rows.map((row) => {
    const withheld = withheldCells(row.hidden, snap.fields);
    return {
      id: row.id,
      data: gridRowData(row.document as Record<string, unknown>, snap.columns),
      ...(withheld ? { withheld } : {}),
    };
  });
}

/** One page through the store's page door (`client.listPage` → `custom.read_records_page`). */
function readRecordsPage(
  home: RecordStoreHome,
  args: { tableId: string; search: string | null; sort: RecordPageSort[]; viewId: string | null; limit: number; offset: number },
) {
  return clientFor(home).listPage({
    table_id: args.tableId,
    search: args.search && args.search.trim() !== "" ? args.search : null,
    sort: args.sort,
    view_id: args.viewId,
    limit: args.limit,
    offset: args.offset,
  });
}

/**
 * EVERY row this person may see, for the few reads whose question is about all of them (an
 * export, the column filter's values, the table profile) — through the page door, a store page at
 * a time, sorted and searched by the store. No ceiling: a table is read to its end.
 */
async function readEveryRow(
  home: RecordStoreHome,
  snap: Snapshot,
  args: { sortField?: string | null; sortDirection?: "asc" | "desc"; searchTerm?: string | null },
): Promise<ServiceResult<GridRow[]>> {
  const sort = pageSort(snap.columns, args.sortField, args.sortDirection);
  // The package pages to the store's declared total and THROWS when it cannot prove it has every
  // row; the store's own refusal is kept so the caller still sees the structured reason.
  const failed: { refusal: RecordsError | null } = { refusal: null };
  try {
    const rows = await readAllRows<ReadRow>(
      async ({ from, to }) => {
        const page = await readRecordsPage(home, {
          tableId: snap.table.id,
          search: args.searchTerm ?? null,
          sort,
          viewId: sort.length === 0 ? snap.handViewId : null,
          limit: to - from + 1,
          offset: from,
        });
        if (!page.ok) {
          failed.refusal = page.error;
          return { data: null, error: { message: page.error.message }, count: null };
        }
        return { data: [...page.data.rows], error: null, count: page.data.total };
      },
      // No ceiling: a table is read to its end.
      { label: `records page door (table ${snap.table.id})`, pageSize: READ_PAGE, maxRows: Number.POSITIVE_INFINITY },
    );
    void versions.drew(clientFor(home), rows.map((r) => r.id));
    return { success: true, data: gridRowsOf(rows, snap) };
  } catch (error) {
    if (failed.refusal) return refused(failed.refusal);
    return plainFailure(error instanceof Error ? error.message : String(error));
  }
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
// on Save and never before, and it opens as the grid (the old Sheet is retired; a saved view
// that still says `layout: "sheet"` reads as the grid). Where the doors are
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
    // A short page is the end: the store's page doors REFUSE a page over their ceiling rather
    // than shrink it (PAGE-1), so fewer rows than asked means there are no more.
    if (page.data.length < READ_PAGE) break;
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
      spec: { name: HAND_ORDER_VIEW, definition: { layout: "grid" } },
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
  const [tableRead, fieldsRead, levelRead, capacity] = await Promise.all([
    client.recordRead({ record_id: tableId }),
    client.fields({ table_id: tableId }),
    client.myLevels({ ids: [tableId] }),
    client.tableCapacity({ table_id: tableId }),
  ]);
  if (!tableRead.ok) return refused(tableRead.error);
  if (!fieldsRead.ok) return refused(fieldsRead.error);
  const fields = fieldsRead.data;
  const choiceSets = await Promise.all(fields.map((f) => choicesFor(client, f)));
  const columns = fields.map((f, i) => gridColumnFromField(f as Field & { expression?: unknown }, tableId, choiceSets[i] ?? null));
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
  if (actions.ok) metadata.row_actions = gridRowActions(actions.data.actions, fields);
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
        rowOrdering: withHandOrder(gridRowOrdering(document.default_sort, fields), hand),
      }),
      fields,
      columns,
      rowCount: capacity.ok ? capacity.data.records : 0,
      level: level ? String(level) : null,
      handOrder: hand.status === "served" && hand.enabled ? hand.order : null,
      handViewId: hand.status === "served" && hand.enabled ? hand.viewId : null,
      at: Date.now(),
    },
  };
}

async function snapshot(home: RecordStoreHome, tableId: string, fresh = false): Promise<ServiceResult<Snapshot>> {
  const held = snapshots.get(tableId);
  if (held && !fresh) {
    const answer = await held;
    if (answer.success && Date.now() - answer.data.at < META_TTL_MS) return answer;
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
    data: { table: snap.data.table, columns: snap.data.columns, row_count: snap.data.rowCount },
  };
}

/**
 * ONE PAGE, ONE CALL (DOOR-SPEED). The store sorts (a column sort, or the hand-set order when the
 * Table's view keeps one and no column sort is asked), searches, pages and counts —
 * `custom.read_records_page`.
 */
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
  const limit = Math.max(1, args.limit);
  const offset = Math.max(0, args.offset);
  const sort = pageSort(snap.data.columns, args.sortField, args.sortDirection);
  // A caller that asks for more than one store page (the filter cache, the cleanup pass, the
  // reorder dialog ask for up to 10,000) is served store page by store page — never refused
  // for asking, never cut short.
  const rows: ReadRow[] = [];
  let total = 0;
  for (let at = offset; ; ) {
    const want = Math.min(READ_PAGE, offset + limit - at);
    const page = await readRecordsPage(home, {
      tableId: args.tableId,
      search: args.searchTerm ?? null,
      sort,
      viewId: sort.length === 0 ? snap.data.handViewId : null,
      limit: want,
      offset: at,
    });
    if (!page.ok) return refused(page.error);
    total = page.data.total;
    rows.push(...page.data.rows);
    at += page.data.rows.length;
    if (page.data.rows.length < want || at >= offset + limit || at >= total) break;
  }
  // THESE ROWS ARE DRAWN: their versions are read now, so an edit is sent against what was seen.
  void versions.drew(clientFor(home), rows.map((r) => r.id));
  return {
    success: true,
    data: {
      rows: gridRowsOf(rows, snap.data),
      pagination: {
        total_count: total,
        page_count: Math.ceil(total / limit),
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
  const rows = await readEveryRow(home, snap.data, { sortField: args.sortField, sortDirection: args.sortDirection });
  if (!rows.success) return rows;
  return {
    success: true,
    data: {
      table: snap.data.table as unknown as Record<string, unknown>,
      fields: snap.data.columns as unknown as Array<Record<string, unknown> & { id: string; field_name: string; display_name: string }>,
      rows: rows.data,
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
  // Every row this person may see that the search matches — searched by the store.
  const read = await readEveryRow(home, snap.data, { searchTerm: args.searchTerm ?? null });
  if (!read.success) return read;
  const rows = read.data;
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

function asDatasetRow(tableId: string, home: RecordStoreHome, id: string, data: Record<string, unknown>, version = 1): DatasetRow {
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
    version,
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
  args: { tableId: string; rowId: string; fieldName: string; value: unknown; expectedVersion?: number | null },
): Promise<ServiceResult<DatasetRow>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const patch = toStoreDocument(columns.data, { [args.fieldName]: args.value });
  // ONE CELL, ONE CALL: the columns come from the held metadata, and nothing is re-read after —
  // the grid patches its page from this answer (`patchLocalCell`). It is sent against the version
  // the row was drawn at; a colleague's change since is refused ("Changed by someone else").
  const client = clientFor(home);
  return afterOwnWrites(args.rowId, async () => {
    const written = await updateRecordAt(client, { record_id: args.rowId, patch, version: await versionFor(args.rowId, args.expectedVersion) });
    if (!written.ok) return refused(written.error);
    versions.wrote(client, args.rowId, written.data);
    return { success: true, data: asDatasetRow(args.tableId, home, args.rowId, { [args.fieldName]: args.value }, written.data) } as ServiceResult<DatasetRow>;
  });
}

/**
 * A CELL SAVED WITH A WORD THAT BECOMES ONE OF ITS COLUMN'S CHOICES, IN ONE SAVE (lane
 * CHOICE-COLUMN-EDIT): the person answered Add to "Add "<words>" to the choices for <column>?".
 * `custom.record_update_adding_choices` adds the words to the column's choices and saves the cell
 * in one transaction, so the choice is then offered everywhere and the cell holds it.
 */
export async function upsertCellAddingChoice(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; fieldName: string; value: unknown; add: string[]; expectedVersion?: number | null },
): Promise<ServiceResult<DatasetRow>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const patch = toStoreDocument(columns.data, { [args.fieldName]: args.value });
  return afterOwnWrites(args.rowId, async () => {
    const seen = await versionFor(args.rowId, args.expectedVersion);
    if (seen === null) return refused(versionUnread());
    // The grid's column name IS the store's key (the mover kept it), so the choices are named by it.
    const written = await recordUpdateAddingChoices(home, args.rowId, { ...patch, _op_id: mintOpId() }, { [args.fieldName]: args.add }, seen);
    invalidateRecordStoreTable(args.tableId);
    if (!written.ok) return refused(written.error);
    versions.wrote(clientFor(home), args.rowId, written.data);
    return { success: true, data: asDatasetRow(args.tableId, home, args.rowId, { [args.fieldName]: args.value }, written.data) } as ServiceResult<DatasetRow>;
  });
}

/**
 * WORDS ADDED TO A COLUMN'S CHOICES, NOTHING ELSE TOUCHED (lane DATA-V2-BASICS-2, BREAKER-2 B2-02): the
 * paste's one question — "Add these words to the choices?" — answered Add. `custom.field_update`'s
 * `options_add` is the same door a cell's Add uses, without a cell.
 */
export async function addChoicesToColumn(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; words: string[] },
): Promise<ServiceResult<{ field_id: string }>> {
  const words = [...new Set(args.words.map((w) => w.trim()).filter(Boolean))];
  if (words.length === 0) return { success: true, data: { field_id: args.fieldId } };
  const written = await clientFor(home).fieldUpdate({ field_id: args.fieldId, patch: { options_add: words } as never });
  invalidateRecordStoreTable(args.tableId);
  if (!written.ok) return refused(written.error);
  return { success: true, data: { field_id: args.fieldId } };
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
  args: { tableId: string; rowId?: string | null; data: Record<string, unknown>; expectedVersion?: number | null },
): Promise<ServiceResult<DatasetRow>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  const client = clientFor(home);
  if (!args.rowId) {
    const made = await client.recordWrite({
      table_id: args.tableId,
      data: toStoreDocument(columns.data, args.data) as never,
    });
    if (!made.ok) return refused(made.error);
    return { success: true, data: asDatasetRow(args.tableId, home, made.data, args.data) };
  }
  const rowId = args.rowId;
  return afterOwnWrites(rowId, async () => {
    const written = await updateRecordAt(client, {
      record_id: rowId,
      patch: toStoreDocument(columns.data, replacing(columns.data, args.data)),
      version: await versionFor(rowId, args.expectedVersion),
    });
    if (!written.ok) return refused(written.error);
    versions.wrote(client, rowId, written.data);
    return { success: true, data: asDatasetRow(args.tableId, home, rowId, args.data, written.data) } as ServiceResult<DatasetRow>;
  });
}

/** Archive one row — `record_delete` is soft and reversible within the Table's retention. */
export async function deleteRow(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string },
): Promise<ServiceResult<{ row_id: string; archived_at: string }>> {
  const done = await clientFor(home).recordDelete({ record_id: args.rowId });
  if (!done.ok) return refused(done.error);
  return { success: true, data: { row_id: args.rowId, archived_at: String(done.data) } };
}

/**
 * Archive a whole custom Table (lane SWITCH-AFTERMATH: /data's home lists a switched
 * organization's tables where they now live, with the same Delete). `record_delete` is soft: the
 * Table goes to Trash and Restore brings it back under its own id.
 */
export async function archiveTable(
  home: RecordStoreHome,
  args: { tableId: string },
): Promise<ServiceResult<{ table_id: string; archived_at: string }>> {
  const done = await clientFor(home).recordDelete({ record_id: args.tableId });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: { table_id: args.tableId, archived_at: String(done.data) } };
}

/**
 * A paste, a fill, a bulk edit or clear, a bulk delete — ONE call to the store's many-changes door
 * (`custom.record_change_many`), ONE transaction: every change lands or none does, and a refused
 * one comes back with the store's own sentence naming its position.
 */
export async function bulkWrite(
  home: RecordStoreHome,
  args: { tableId: string; operations: BulkOp[] },
): Promise<ServiceResult<BulkWriteResponse>> {
  const columns = await columnsOf(home, args.tableId);
  if (!columns.success) return columns;
  if (args.operations.length === 0) {
    return { success: true, data: { table_id: args.tableId, count: 0, results: [] } };
  }
  const written: Array<Record<string, unknown>> = [];
  // EVERY UPDATE IN THE BATCH NAMES THE VERSION ITS ROW WAS DRAWN AT (or the caller's own — an undo's):
  // a row a colleague changed since refuses the whole batch, never a paste over their change.
  const changes: VersionedChange[] = [];
  for (const op of args.operations) {
    if (op.op === "insert") {
      written.push(op.data);
      changes.push({ op: "insert", data: toStoreDocument(columns.data, op.data) as never });
      continue;
    }
    if (op.op === "delete") {
      written.push({});
      changes.push({ op: "archive", record_id: op.row_id as never });
      continue;
    }
    const data =
      op.op === "cell" ? { [op.field_name]: op.value } : op.op === "update" ? replacing(columns.data, op.data) : op.data;
    written.push(data);
    changes.push({
      op: "update",
      record_id: op.row_id,
      patch: toStoreDocument(columns.data, data),
      expected_version: await versionFor(op.row_id, op.expected_version),
    });
  }
  const client = clientFor(home);
  const done = await changeRecordsAt(client, { table_id: args.tableId, changes });
  if (!done.ok) return refused(done.error);
  for (const result of done.data) if (result.op === "update") versions.wrote(client, result.id, result.version);
  const results: BulkOpResult[] = done.data.map((result, i) =>
    asDatasetRow(args.tableId, home, result.id, written[i] ?? {}, "version" in result && typeof result.version === "number" ? result.version : 1),
  );
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

function gridRowActions(actions: readonly StoreRowAction[], fields: readonly Field[]): unknown[] {
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
      id: typeof a.id === "string" && isUuidShape(a.id) ? a.id : crypto.randomUUID(),
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
  return { success: true, data: { row_actions: read.ok ? gridRowActions(read.data.actions, fields.data) : mapped } };
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
      "A custom table names its rows by one of its columns; a label worked out by a formula is not something it keeps yet. Pick a column instead.",
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
        `"${picked.label || picked.key}" is worked out by the table, and a custom table names its rows by a column that holds its own words. Pick a column people fill in. Nothing was changed.`,
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
      "A custom table is shared by the Share button, person by person or with the organization — it has no public switch. Nothing was changed.",
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

/**
 * BRING A REMOVED COLUMN BACK (DATA-V2-BASICS-2 F18). The store retires a column — its values stay
 * on every record — and `custom.field_restore` brings it back with them. Through the records
 * client's own door, so the restore ANNOUNCES the Table's shape change like every other structure
 * door (a `table:<uuid>` card on the page repaints — KINDS-GLUE wave 3 slice 4).
 */
export async function restoreField(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string },
): Promise<ServiceResult<{ field_id: string }>> {
  const restored = await clientFor(home).fieldRestore({ field_id: args.fieldId as never });
  invalidateRecordStoreTable(args.tableId);
  if (!restored.ok) return plainFailure(`The column could not be brought back: ${restored.error.message}. It is still retired; its values are kept.`);
  return { success: true, data: { field_id: args.fieldId } };
}

/**
 * HOW MANY RECORDS HOLD EACH CHOICE of one choice column (lane CHOICE-TAILS), keyed by the
 * option's id — what the column editor says before a choice records still hold is removed:
 * "3 records use “X-ray”." A column that is not a choice column answers `{}`.
 */
export async function getChoiceUsage(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string },
): Promise<ServiceResult<Record<string, ChoiceUsage>>> {
  const answer = await clientFor(home).fieldChoiceUsage({ field_id: args.fieldId });
  if (!answer.ok) return refused(answer.error);
  return { success: true, data: answer.data };
}

/**
 * PUT A CHOICE REMOVAL BACK (lane CHOICE-TAILS): the list as it was and every cell as it was, in
 * ONE save through the same door that removed it (`custom.field_update_rehoming_choices`).
 */
export async function undoChoiceRemoval(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; undo: ChoicesRehomed["undo"] },
): Promise<ServiceResult<{ field_id: string; cells_back: number }>> {
  const answer = await clientFor(home).fieldUpdateRehomingChoices({
    field_id: args.fieldId,
    patch: { options: args.undo.options },
    cells_back: args.undo.cells_back,
  });
  invalidateRecordStoreTable(args.tableId);
  if (!answer.ok) return refused(answer.error);
  return { success: true, data: { field_id: args.fieldId, cells_back: answer.data.cells_back } };
}

export async function setFieldFormat(
  home: RecordStoreHome,
  args: {
    tableId: string;
    fieldId: string;
    format: FieldFormatConfig | null;
    /** Where the records of each removed choice go, keyed by the option's id (lane CHOICE-TAILS). */
    rehome?: Record<string, ChoiceRehome> | undefined;
  },
): Promise<ServiceResult<{ field_id: string; undo?: ChoicesRehomed["undo"]; rehomed?: ChoicesRehomed["rehomed"] }>> {
  const field = await fieldById(home, args.tableId, args.fieldId);
  if (!field.success) return field;
  const client = clientFor(home);
  // SEAM HONESTY: every option of the format is carried through `custom.field_update` or the
  // whole save is refused before anything is written (record-store-shape.ts `storeFormatWrite`).
  let current: { choices: StoreChoice[] | null } = { choices: null };
  if (String(field.data.type) === "list") {
    const options = await client.fieldOptions({ field_id: args.fieldId });
    if (!options.ok) return refused(options.error);
    current = {
      // The LIVE options, in the store's declared order — what the editor was showing.
      choices: liveOptionsInOrder(options.data)
        .map((option) => choiceFromOption(option as { id?: unknown; data?: Record<string, unknown> | null }))
        .filter((c): c is StoreChoice => c !== null),
    };
  }
  const write = storeFormatWrite(field.data, args.format, current);
  if (!write.ok) return plainFailure(write.says);
  let undo: ChoicesRehomed["undo"] | undefined;
  let rehomed: ChoicesRehomed["rehomed"] | undefined;
  const rehome = args.rehome && Object.keys(args.rehome).length > 0 ? args.rehome : undefined;
  for (const [i, patch] of write.patches.entries()) {
    // THE LIST AND WHERE ITS REMOVED CHOICES' RECORDS GO, ONE SAVE (lane CHOICE-TAILS): the patch
    // that carries the choices goes through the door that also moves, keeps or clears those cells.
    const withRehome = rehome && Array.isArray((patch as { options?: unknown }).options);
    const written = withRehome
      ? await client.fieldUpdateRehomingChoices({ field_id: args.fieldId, patch: patch as never, rehome })
      : await client.fieldUpdate({ field_id: args.fieldId, patch: patch as never });
    if (written.ok && withRehome) {
      const answer = written.data as ChoicesRehomed;
      undo = answer.undo;
      rehomed = answer.rehomed;
    }
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
  return { success: true, data: { field_id: args.fieldId, ...(undo ? { undo, rehomed } : {}) } };
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
  // A DAY IS A DATE-AND-TIME COLUMN SHOWN AS A DATE (DATA-V2-BASICS-2 T2): the store has no "date"
  // kind, and the Sheet's "Date" choice refused every time — a dead option in the Stores list.
  date: "datetime",
};

/** The storage types a record-store column can be changed into — the Sheet's Stores list offers only these. */
export const RECORD_STORE_COLUMN_TYPES: readonly string[] = Object.keys(KIND_FOR_TYPE);

export async function changeFieldType(
  home: RecordStoreHome,
  args: { tableId: string; fieldId: string; newType: string },
): Promise<ServiceResult<{ field_id: string; new_type: string; strategy: string; rows_rewritten: number; rows_skipped: number; rows_total: number; values_emptied: number }>> {
  const kind = KIND_FOR_TYPE[args.newType];
  if (!kind) {
    return plainFailure(
      `The record store has no "${args.newType}" kind of column to change this one into. Nothing was changed.`,
    );
  }
  // THE LOOK GOES WITH THE KIND (TABLE-EDIT-DEFECTS T26): a look that no longer fits what the column
  // stores is cleared in the same change — "Patient Notes" changed back to text kept its Number look,
  // and every word typed into it afterwards was read as a number and dropped. Read before the retype.
  // One read of the columns (not the whole table snapshot). The look rides the Field's
  // `display_format` ({id, options}), as `gridColumnFromField` reads it. A failed read leaves the
  // look as it is — the retype itself is the person's ask and still goes.
  const columnsNow = await clientFor(home).fields({ table_id: args.tableId });
  const before = columnsNow.ok ? columnsNow.data.find((f) => f.id === args.fieldId) : undefined;
  const shownAs = (before as { display_format?: { id?: unknown } | null } | undefined)?.display_format?.id ?? null;
  const staleLook = typeof shownAs === "string" && shownAs !== "" && !lookFitsKind(shownAs, kind);
  // FLD-4 / T12: the store converts what converts and keeps what does not in
  // `_retired`, with the reason — neither coerced nor deleted.
  const behaviour = kind === "text" ? "text" : kind === "checkbox" ? "boolean" : "range";
  const retyped = await migrateRetype(home, args.fieldId, behaviour);
  if (!retyped.ok) {
    invalidateRecordStoreTable(args.tableId);
    return doorRefused(retyped);
  }
  const shape: Record<string, unknown> | null =
    args.newType === "date"
      ? { type: "datetime", display_format: { id: "date" } }
      : kind === "datetime"
        ? { type: "datetime", ...(staleLook ? { display_format: null } : {}) }
        : args.newType === "integer"
          ? { display_format: { id: "integer" } }
          : staleLook
            ? { display_format: null }
            : null;
  if (shape) {
    const shaped = await clientFor(home).fieldUpdate({
      field_id: args.fieldId,
      patch: shape as never,
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
  const read = await readEveryRow(home, snap.data, {});
  if (!read.success) return read;
  const allRows = read.data;
  const columns: unknown[] = [];
  for (const c of snap.data.columns) {
    const facets = await getColumnFacets(home, { tableId: args.tableId, fieldName: c.field_name, limit: args.previewValues ?? 12 });
    if (!facets.success) return facets;
    let numeric = 0;
    let url = 0;
    let email = 0;
    let bool = 0;
    for (const row of allRows) {
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
  return { success: true, data: { table_id: args.tableId, total_rows: allRows.length, columns } };
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
  void versions.drew(clientFor(home), read.data.map((r) => r.id));
  return {
    success: true,
    data: read.data.map((r) => ({ id: r.id, data: gridRowData(r.document as Record<string, unknown>, columns.data) })),
  };
}

// ─── history ────────────────────────────────────────────────────────────────
//
// The grid's history panel reads one version per
// change, carrying the WHOLE row after (`data`) and before (`prior_data`). The
// store keeps each version as the fields that moved, with before and after —
// so the whole-row snapshots are rebuilt here, oldest to newest, from exactly
// what the store recorded. Nothing is guessed: a key the store never recorded
// is absent from the snapshot, as it was absent from the record.

/** The store's own verb: the whole record back to a version, as a NEW version. */
export async function restoreRowVersion(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; version: number; seenVersion: number | null },
): Promise<ServiceResult<null>> {
  // Only while the record is still at the version the person saw in the history panel.
  const done = await restoreAt(clientFor(home), { record_id: args.rowId, version: args.version, seenVersion: args.seenVersion });
  invalidateRecordStoreTable(args.tableId);
  if (!done.ok) return refused(done.error);
  return { success: true, data: null };
}

/** One column back to what it said at a version, as a NEW version (HIS-N-2). */
export async function revertRowField(
  home: RecordStoreHome,
  args: { tableId: string; rowId: string; fieldName: string; version: number; seenVersion: number | null },
): Promise<ServiceResult<null>> {
  const done = await restoreAt(clientFor(home), {
    record_id: args.rowId,
    field_key: args.fieldName,
    version: args.version,
    seenVersion: args.seenVersion,
  });
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

// ─── table settings: the settings dialogs' shape ────────────────────────────

/** The column settings this seam carries (the settings dialogs' field keys it has a door for). */
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
        ? "A custom table is shared by the Share button, person by person or with the organization — it has no public switch. Nothing was changed."
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
      const patch: Record<string, unknown> = {};
      // A COLUMN'S DEFAULT (DATA-V2-BASICS-2): what a new row that does not name this column starts
      // with — the store fills it (`custom.record_write`). An emptied box clears it; the same value
      // sends nothing.
      if (update.default_value !== undefined) {
        const next = newDefault(update.default_value);
        const now = (field as { default?: unknown }).default ?? null;
        if (JSON.stringify(next) !== JSON.stringify(now)) patch.default = next;
      }
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

/**
 * The older storage type an Add Column form picks → a new store Field's spec. EVERY storage type the
 * picker can send has one (TABLE-EDIT-DEFECTS T05: "Date & time" sent `datetime`, which had none, and
 * Add Column refused with "The record store has no "datetime" kind of column" while offering it).
 * Guard: features/data-tables/__tests__/every-look-add-column-offers-can-be-made.test.ts.
 */
export function specForNewColumn(dataType: string): Record<string, unknown> | null {
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
    case "datetime":
      // `kind` is what makes it a day AND a time: `type: "datetime"` alone is stored as a day
      // (custom._field_document_for: config.kind "date" unless the spec says "datetime").
      return { type: "datetime", kind: "datetime" };
    case "json":
      return { plain: "text", display_format: { id: "json" } };
    case "array":
      return { type: "text", multi: true };
    default:
      return null;
  }
}

/**
 * The default a column dialog typed, as the store keeps it: words trimmed, an empty box is "no
 * default" (null). Numbers, ticks and dates stay what they are; the store converts a default to the
 * column's own kind when it fills a new row, and leaves out one that does not fit.
 */
function newDefault(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const words = value.trim();
    return words === "" ? null : words;
  }
  return value;
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
  const spec = specForNewColumn(args.dataType);
  const startsWith = newDefault(args.defaultValue);
  if (!spec) return { success: false, error: `The record store has no "${args.dataType}" kind of column.` };
  const made = await clientFor(home).fieldDeclare({
    table_id: args.tableId,
    spec: {
      label: args.displayName,
      // THE KEY IS THE STORE'S TO CHOOSE (lane DATA-V2-BASICS, 2026-09-27). `args.fieldName` is the
      // older dialog's guess from the name ("Resets" → `resets`); sent as an asked-for key it is
      // refused when another column already holds it — Arman's renamed "Account Type" still held
      // `resets`, so adding "Resets" failed with a sentence about a column nobody could see. Left
      // out, `custom.field_declare` derives it and picks one no column has ever held.
      required: args.isRequired,
      ...(typeof args.fieldOrder === "number" ? { sort: args.fieldOrder } : {}),
      // A new row that does not name this column starts with its default (DATA-V2-BASICS-2).
      ...(startsWith !== null ? { default: startsWith } : {}),
      ...spec,
    } as never,
  });
  invalidateRecordStoreTable(args.tableId);
  if (!made.ok) {
    // A column the clock cut off does not exist, and the dialog says so in as many words — never a
    // machine's line a person reads as "maybe it landed" (clone walk, 2026-10-03: "fieldDeclare:
    // timed_out — canceling statement…" twice, and the person re-added the column to find out).
    const said = refused(made.error);
    return {
      success: false,
      error: made.error.code === "timed_out" ? `The column was not added. ${said.error} ${said.refusal?.hint ?? ""}`.trim() : said.error,
    };
  }
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
 * records-ui primitive the /data "New table" button uses, so a table saved from a chat
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
      `${asked.map((n) => `"${n}"`).join(", ")} ${asked.length === 1 ? "was" : "were"} made optional: a new custom table demands no column until someone marks it required in the column's settings.`,
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
