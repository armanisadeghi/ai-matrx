// features/data-tables/data-source/record-store-grid.ts — THE GRID PRIMITIVES' DOORS, CALLED BY NAME.
//
// `@ai-matrx/records` 0.57.0 carries a typed method for every grid primitive (colors,
// layout, row actions, autonumber, recordChangeTrigger) and `record-store.ts` calls them there.
// The doors left here are the ones the installed client has no method for yet, called the way
// `features/record-change-approvals/applyRecordChange.ts` calls `work_approval_*`: through
// the SAME data source the records client uses, schema `custom`, with the store's refusal
// mapped by the package's own `mapPgError`:
//   custom.record_change_actions  — lane GRID-PORT's presence door for G8 (not in the catalogue)
//   custom.migrate_retype         — in the catalogue, no client method
// 🚨 SWAP WHEN WRAPPED: each becomes a one-line client call and this file goes away.
//
// A door that is not on the database this browser talks to (production before
// the 01:00–04:00 PT apply) answers PGRST202; that is mapped to ONE sentence a
// person can read, and the grid shows the capability as absent — never a dead
// control that fails when pressed.

import { mapPgError } from "@ai-matrx/records/core";
import { mintOpId } from "@ai-matrx/records";
import type { HiddenFieldNotice, RecordsError } from "@ai-matrx/records";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";

import type { RecordStoreHome } from "./table-home";

type DoorAnswer<T> = { ok: true; data: T } | { ok: false; error: RecordsError; absent: boolean };

const ABSENT_CODES = new Set(["PGRST202", "42883"]);

let source: ReturnType<typeof recordsDataSource> | null = null;
function dataSource() {
  source ??= recordsDataSource(createClient());
  return source;
}

/** Call one `custom.*` door by name, as the records client would. */
export async function callGridDoor<T>(
  home: RecordStoreHome,
  door: string,
  args: Record<string, unknown>,
): Promise<DoorAnswer<T>> {
  const answer = (await dataSource().rpc(door, { p_organization_id: home.organizationId, ...args }, { schema: "custom" })) as {
    data: unknown;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
  };
  if (answer.error) {
    const absent = ABSENT_CODES.has(answer.error.code ?? "");
    const error = mapPgError(answer.error, `custom.${door}`);
    return {
      ok: false,
      absent,
      error: absent
        ? {
            ...error,
            message: `The record store this page is connected to does not have custom.${door} yet — it arrives with the grid primitives' database update (lane GRID-PRIMITIVES).`,
          }
        : error,
    };
  }
  return { ok: true, data: answer.data as T };
}

// ─── G8: a row change can start an agent ─────────────────────────────────────

export type RecordChangeActions = {
  entity_type: string;
  table_id: string;
  actions: Array<{ value: string; label: string }>;
};

/**
 * The changes an `event` schedule on this Table may listen for
 * (`custom.record_change_actions`, lane GRID-PORT, applied right after G8). The door being
 * there IS the signal that G8 is: before it, a record-store row change reaches no schedule,
 * so the grid offers nothing rather than a schedule that never fires.
 */
export function recordChangeActions(home: RecordStoreHome, tableId: string) {
  return callGridDoor<RecordChangeActions>(home, "record_change_actions", { p_table_id: tableId });
}

// ─── the store's own verbs the published client does not wrap ───────────────

/** FLD-4 / T12: change what a field behaves as; values convert or are kept in `_retired`. */
export function migrateRetype(home: RecordStoreHome, fieldId: string, to: string) {
  return callGridDoor<{ changed: boolean; records_still_holding_a_value?: number; values_in_retired_for_this_field?: number }>(
    home,
    "migrate_retype",
    { p_id: fieldId, p_to: to },
  );
}

// ─── G13: a view keeps the order a person dragged ────────────────────────────
//
// `custom.read_records_in_view_order` / `custom.view_record_order_set` (lane GRID-PRIMITIVES,
// `gridprim_a_view_keeps_the_order_a_person_dragged.sql`). The package's source wraps them as
// `readInViewOrder` / `viewRecordOrderSet`, but the published client this repo installs does
// not carry them yet, so they are called by name here.
// 🚨 SWAP ON PUBLISH: `clientFor(home).readInViewOrder(...)` / `.viewRecordOrderSet(...)`.

/** One page of a hand-ordered view: placed rows by position, then the rest by created time. */
export function readRecordsInViewOrder(home: RecordStoreHome, viewId: string, limit: number, offset: number) {
  return callGridDoor<Array<{ id: string; position: number | string | null }>>(home, "read_records_in_view_order", {
    p_view_id: viewId,
    p_by_id: false,
    p_limit: limit,
    p_offset: offset,
  });
}

/** Keep this order on the view: the named rows first, in this order, every position re-spaced. */
export function viewRecordOrderSet(home: RecordStoreHome, viewId: string, recordIds: readonly string[]) {
  return callGridDoor<Record<string, unknown>>(home, "view_record_order_set", {
    p_view_id: viewId,
    p_record_ids: [...recordIds],
  });
}

// ─── DOOR-SPEED: one page sorted/searched/counted; many changes, one transaction ─
//
// `custom.read_records_page` / `custom.record_change_many` (lane data-tables-grid-overhaul,
// `migrations/campaign/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql`,
// applied to production 2026-09-26). `@ai-matrx/records` wraps them as `listPage` /
// `recordChangeMany` from the release after 0.58.17; until this repo installs it they are called
// by name here, through the same data source, with the same op-id echo contract.
// 🚨 SWAP ON PUBLISH: `clientFor(home).listPage(...)` / `.recordChangeMany(...)`.

export type RecordPageSortSpec = { field: string; direction: "asc" | "desc"; as: "text" | "number" | "date" };
export type PageDoorRow = { id: string; document: unknown; level: string };

/** A document as the read doors answer it: the values, and the masked fields' notices under `_hidden`. */
export function unfoldDocument(document: unknown): {
  document: Record<string, unknown>;
  hidden: Record<string, HiddenFieldNotice>;
} {
  const raw = (document ?? {}) as Record<string, unknown>;
  const hidden = (raw._hidden ?? {}) as Record<string, HiddenFieldNotice>;
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "_hidden") values[key] = value;
  }
  return { document: values, hidden };
}

/** One page, sorted, searched, filtered and counted by the store. */
export async function readRecordsPage(
  home: RecordStoreHome,
  args: {
    tableId: string;
    search?: string | null;
    sort?: readonly RecordPageSortSpec[];
    viewId?: string | null;
    filter?: Record<string, unknown>;
    limit: number;
    offset: number;
  },
): Promise<DoorAnswer<{ rows: PageDoorRow[]; total: number }>> {
  const answer = await callGridDoor<{ total: number | string; rows: PageDoorRow[] | null }>(home, "read_records_page", {
    p_table_id: args.tableId,
    p_filter: args.filter ?? {},
    p_search: args.search && args.search.trim() !== "" ? args.search : null,
    p_sort: args.sort ?? [],
    p_view_id: args.viewId ?? null,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (!answer.ok) return answer;
  return { ok: true, data: { rows: answer.data?.rows ?? [], total: Number(answer.data?.total ?? 0) } };
}

export type StoreChange =
  | { op: "insert"; data: Record<string, unknown> }
  | { op: "update"; record_id: string; patch: Record<string, unknown> }
  | { op: "archive"; record_id: string };
export type StoreChangeResult =
  | { op: "insert"; id: string }
  | { op: "update"; id: string; version: number }
  | { op: "archive"; id: string; archived_at: string };

/**
 * Many changes to one Table in ONE call and ONE transaction. One op id rides every insert and
 * patch, so this browser's realtime port recognises the one notice as its own echo.
 */
export function recordChangeMany(home: RecordStoreHome, tableId: string, changes: readonly StoreChange[]) {
  const opId = mintOpId();
  return callGridDoor<StoreChangeResult[]>(home, "record_change_many", {
    p_table_id: tableId,
    p_changes: changes.map((c) =>
      c.op === "insert"
        ? { op: "insert", data: { ...c.data, _op_id: opId } }
        : c.op === "update"
          ? { op: "update", record_id: c.record_id, patch: { ...c.patch, _op_id: opId } }
          : c,
    ),
  });
}

// ─── G13: whether this store keeps a hand-set order at all ───────────────────
//
// LANE FE-TAILS (2026-09-24). This used to be a PROBE: a read of a view id that cannot exist,
// answered 23503 by a store that has the door (and PGRST202 by one that does not). The answer
// was right and the request was a designed failure — PostgREST returns a 409 for it, so every
// table opened in the Sheet put an error in the console (the admin debug badge's "2 errors").
// A console never carries a designed error. The store now SAYS what a view accepts:
// `custom.view_keys()` is the registry, and G13's order is its `order` key (writer `server`,
// written only by `custom.view_record_order_set`). One read, once per page load, never an error
// on a store that has it.

const ORDER_KEY = "order";
const NO_HAND_ORDER =
  "The record store this page is connected to does not keep a hand-set row order yet — it arrives with the grid primitives' database update (lane GRID-PRIMITIVES).";

let handOrderKnown: Promise<string | null> | null = null;

/** Null when the store keeps hand-set orders; else the one sentence for why the Reorder control is absent. */
export function handOrderAbsence(): Promise<string | null> {
  handOrderKnown ??= (async () => {
    const answer = (await dataSource().rpc("view_keys", {}, { schema: "custom" })) as {
      data: unknown;
      error: { message: string; code?: string; hint?: string; details?: string } | null;
    };
    if (answer.error) {
      // Not remembered: a failed read is not an answer about the store, so the next open asks again.
      handOrderKnown = null;
      return ABSENT_CODES.has(answer.error.code ?? "") ? NO_HAND_ORDER : mapPgError(answer.error, "custom.view_keys").message;
    }
    const keys = Array.isArray(answer.data) ? (answer.data as Array<{ path?: unknown }>) : [];
    return keys.some((k) => k.path === ORDER_KEY) ? null : NO_HAND_ORDER;
  })();
  return handOrderKnown;
}
