// features/data-tables/data-source/locate-table.ts — WHICH STORE AN EXISTING TABLE LIVES IN,
// asked of the record store's own Table kernel by id (`whereThisTableLives`, the same answer
// /data/[id] uses), and PLACED there when the store holds it so every seam export that follows
// dispatches to the store. Lane INTEG-CLIENTS (CUTOVER-PLAN rev 3 §2 Steps 1–4).

import { createClient } from "@/utils/supabase/client";
import { whereThisTableLives } from "@/features/unified-data/whereThisTableLives";
import { standInOrganizationId } from "@/features/unified-data/objectOrganization";

import { placeTableInRecordStore, recordStoreHomeOf, type RecordStoreHome } from "./table-home";
import { signedInUserId } from "./where-a-table-is-born";

export type Located =
  | { ok: true; store: "record"; home: RecordStoreHome }
  | { ok: true; store: "older" }
  | { ok: false; error: string };

/**
 * Where an EXISTING table lives, and — when it is the record store — place it there so the
 * seam's next call about it dispatches correctly. Idempotent: a table already placed answers
 * from the registry without a round trip.
 */
export async function locateTable(tableId: string, organizationId?: string | null): Promise<Located> {
  const placed = recordStoreHomeOf(tableId);
  if (placed) return { ok: true, store: "record", home: placed };
  // ACCESS IS PERSONAL (owner, 2026-09-23). The table names its own organization
  // (`custom.where_id_opens`, inside `whereThisTableLives`); the caller's organization —
  // or, failing that, the one the person is working in — is read ONLY by the announced
  // stand-in while that door is absent from a database. It is never held for: a table that
  // exists has an organization, and asking the person to pick one is asking the wrong question.
  const where = await whereThisTableLives(createClient(), organizationId ?? standInOrganizationId(), tableId);
  if (where.kind === "unknown") {
    return {
      ok: false,
      error: `Could not ask the record store where this table lives, so nothing was written to it. Try again. (${where.why})`,
    };
  }
  if (where.kind === "no_access") {
    return {
      ok: false,
      error: "This table lives in the record store and has not been shared with you. Ask whoever holds it to share it.",
    };
  }
  if (where.kind === "record_store") {
    const home = { organizationId: where.organizationId, userId: await signedInUserId() };
    placeTableInRecordStore(tableId, home);
    return { ok: true, store: "record", home: { store: "record", ...home } };
  }
  return { ok: true, store: "older" };
}
