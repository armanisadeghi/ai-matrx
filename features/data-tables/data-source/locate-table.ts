// features/data-tables/data-source/locate-table.ts — WHERE AN EXISTING TABLE IS READ FROM: the
// record store, in the table's OWN organization (`whereThisTableLives`, the same answer /data/[id]
// uses), remembered in `table-home.ts` so every seam export that follows reaches the store.

import { createClient } from "@/utils/supabase/client";
import { whereThisTableLives } from "@/features/unified-data/whereThisTableLives";

import { placeTableInRecordStore, recordStoreHomeOf, signedInUserId, type RecordStoreHome } from "./table-home";

export type Located =
  | { ok: true; store: "record"; home: RecordStoreHome }
  | { ok: false; error: string };

/**
 * Where an EXISTING table lives, remembered for the seam's next call about it. Idempotent: a table
 * already placed answers from the registry without a round trip.
 */
export async function locateTable(tableId: string): Promise<Located> {
  const placed = recordStoreHomeOf(tableId);
  if (placed) return { ok: true, store: "record", home: placed };
  // ACCESS IS PERSONAL (owner, 2026-09-23). The table names its own organization
  // (`custom.where_id_opens`, inside `whereThisTableLives`); the active one is never used.
  const where = await whereThisTableLives(createClient(), tableId);
  if (where.kind === "unknown") {
    return {
      ok: false,
      error: `Could not ask where this table lives, so nothing was read or written. Try again. (${where.why})`,
    };
  }
  if (where.kind === "nowhere") {
    return { ok: false, error: "This table is not one you can open. It may have been deleted, or it was never shared with you." };
  }
  const home = { organizationId: where.organizationId, userId: await signedInUserId() };
  placeTableInRecordStore(tableId, home);
  return { ok: true, store: "record", home: { store: "record", ...home } };
}
