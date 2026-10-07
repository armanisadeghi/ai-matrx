// features/data-tables/data-source/table-home.ts — WHO IS READING THIS RECORD-STORE TABLE.
//
// THE ONE DATA-SOURCE SEAM (lane GRID-PORT, 2026-09-23). The table page — records-ui, its
// dialogs, its hooks — reaches its data through the exports of `features/data-tables/service.ts`
// and nothing else. Every table lives in the record store (`custom.*`, through
// `@ai-matrx/records`, in `record-store.ts`); the store's doors are keyed (organization, id) and
// carry the actor, so every export needs the table's organization and the signed-in person. This
// module remembers them per table id once a host (or `locateTable`) has asked the store.
//
// WHY A REGISTRY RATHER THAN A CONTEXT. The seam's exports are called from ~20 modules — modals,
// hooks, the cell editor, the undo stack — several of which are plain functions; the id every
// call already carries is the key this module needs.

import { createClient } from "@/utils/supabase/client";

/** Who is reading a record-store table, which the store's doors need on every call. */
export type RecordStoreHome = {
  store: "record";
  /** REC-29: the store is keyed (organization, id); the table names it, every time. */
  organizationId: string;
  /** The signed-in person, for the actor envelope. Null reads still work. */
  userId: string | null;
};

const homes = new Map<string, RecordStoreHome>();

/** The signed-in person's id, or null. */
export async function signedInUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user?.id ?? null;
}

/** The remembered home of `tableId`, or null when nobody has asked the store about it yet. */
export function recordStoreHomeOf(tableId: string | null | undefined): RecordStoreHome | null {
  if (!tableId) return null;
  return homes.get(tableId) ?? null;
}

/** Remember where a table is read from (its organization, the reader). */
export function placeTableInRecordStore(
  tableId: string,
  home: { organizationId: string; userId: string | null },
): void {
  homes.set(tableId, { store: "record", organizationId: home.organizationId, userId: home.userId });
}

/** Every placement, for a test harness to clear between cases. */
export function forgetAllTablePlacements(): void {
  homes.clear();
}
