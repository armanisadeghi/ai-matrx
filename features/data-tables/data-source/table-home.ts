// features/data-tables/data-source/table-home.ts — WHICH STORE THIS GRID IS READING.
//
// THE ONE DATA-SOURCE SEAM (lane GRID-PORT, 2026-09-23). The /data grid —
// `UserTableViewer`, its modals, its hooks — reaches its data through the
// exports of `features/data-tables/service.ts` and nothing else. Every one of
// those exports takes the table's id, and every one of them asks THIS module
// which store holds that table before it does anything:
//
//   older   — `workbench.udt_*` through the `udt_*` / `*_user_table_*` doors.
//             The default. A table nobody has placed is an older table, which is
//             exactly what every surface that mounts the grid today expects.
//   record  — the record store (`custom.*`) through `@ai-matrx/records`, in
//             `record-store.ts`. A table is placed here by the host that asked
//             `whereThisTableLives` and got `record_store` back.
//
// There is no second viewer and no fork per route: one grid, two
// implementations of one interface, chosen per table.
//
// WHY A REGISTRY RATHER THAN A CONTEXT. The seam is `service.ts`'s exports, and
// they are called from ~20 modules — modals, hooks, the cell editor, the undo
// stack — none of which receive a React context today and several of which are
// plain functions. A context would have meant threading a provider through
// every one of them and a second call shape beside the first; the id every call
// already carries is the key this module needs.

/** Who is reading a record-store table, which the store's doors need on every call. */
export type RecordStoreHome = {
  store: "record";
  /** REC-29: the store is keyed (organization, id); the host names it, every time. */
  organizationId: string;
  /** The signed-in person, for the actor envelope. Null reads still work. */
  userId: string | null;
};

export type TableHome = { store: "older" } | RecordStoreHome;

const OLDER: TableHome = { store: "older" };

const homes = new Map<string, RecordStoreHome>();
const listeners = new Set<() => void>();

/** Where `tableId` is read from. Unplaced means the older store. */
export function tableHome(tableId: string | null | undefined): TableHome {
  if (!tableId) return OLDER;
  return homes.get(tableId) ?? OLDER;
}

/** The record-store home of `tableId`, or null when it is an older table. */
export function recordStoreHomeOf(tableId: string | null | undefined): RecordStoreHome | null {
  if (!tableId) return null;
  return homes.get(tableId) ?? null;
}

/**
 * Place a table in the record store. Called by the host (the /data/[id] route)
 * once `whereThisTableLives` has answered `record_store` for it.
 */
export function placeTableInRecordStore(
  tableId: string,
  home: { organizationId: string; userId: string | null },
): void {
  homes.set(tableId, { store: "record", organizationId: home.organizationId, userId: home.userId });
  for (const listener of listeners) listener();
}

/** Forget a placement (a test, or a host that unmounts and must not leak one). */
export function forgetTablePlacement(tableId: string): void {
  if (homes.delete(tableId)) for (const listener of listeners) listener();
}

/** Every placement, for a test harness to clear between cases. */
export function forgetAllTablePlacements(): void {
  if (homes.size === 0) return;
  homes.clear();
  for (const listener of listeners) listener();
}

/** Subscribe to placement changes (useSyncExternalStore-shaped). */
export function subscribeToTablePlacements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
