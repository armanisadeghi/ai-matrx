// features/data-tables/data-source/where-a-table-is-born.ts — WHICH STORE A NEW TABLE IS
// BORN IN, AND WHICH STORE AN EXISTING TABLE AN INTEGRATION WAS HANDED LIVES IN.
//
// Lane INTEG-CLIENTS (Unified Data System, 2026-09-23), CUTOVER-PLAN rev 3 §2 Steps 1–3.
//
// THE DEFECT THIS CLOSES. Every "save this as a table" button outside the grid — a
// chat answer, a CSV block, a canvas table, a page extraction, the zip heatmap, the
// ts-function registry — called `create_new_user_table_dynamic` directly, so a table
// made by a person whose organization had already MOVED into the record store was born
// in the older store, which that organization's screens no longer read. After the flip
// it would have had no home at all. And every "append to an existing table" path
// reached the grid's seam with the table UNPLACED (placement was only ever made by the
// /data/[id] route), so the seam ran the older door on a moved table's archived copy
// and reported success.
//
// THE TWO ANSWERS, both asked of the database, never guessed:
//
//   bornIn(org)      — `platform.knob_resolve('data_tables','older_tables_moved', org)`.
//                      TRUE is written by the mover when it moves an organization and, at
//                      the flip, for every organization (and as the platform default).
//                      Until then an unmoved organization's new tables stay older, which
//                      is what its screens read. A read that fails REFUSES the birth in
//                      words: making a table in the wrong store is worse than not making
//                      it, and after the flip the older store refuses writes anyway.
//   locateTable(id)  — the record store's own Table kernel read by id
//                      (`whereThisTableLives`, the same answer /data/[id] uses). Found →
//                      the table is PLACED in the record store so every seam export that
//                      follows dispatches to the store. Not found → older, unplaced.

import { createClient } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { whereThisTableLives } from "@/features/unified-data/whereThisTableLives";

import { placeTableInRecordStore, recordStoreHomeOf, type RecordStoreHome } from "./table-home";

/** The knob the mover writes when an organization's tables move (move.py MOVED_KNOB). */
export const OLDER_TABLES_MOVED_KNOB = { feature: "data_tables", key: "older_tables_moved" } as const;

export type BirthStore =
  | { ok: true; store: "record"; home: RecordStoreHome }
  | { ok: true; store: "older"; organizationId: string }
  | { ok: false; error: string };

async function signedInUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Where a table this person makes for `organizationId` is born. The organization is the
 * caller's (never derived here — `ensureOrgId` holds the request when there is none).
 */
export async function whereANewTableIsBorn(organizationId?: string | null): Promise<BirthStore> {
  const org = await ensureOrgId(organizationId ?? null);
  const userId = await signedInUserId();
  const answer = await createClient()
    .schema("platform")
    .rpc("knob_resolve", {
      p_feature: OLDER_TABLES_MOVED_KNOB.feature,
      p_key: OLDER_TABLES_MOVED_KNOB.key,
      p_organization_id: org,
      ...(userId ? { p_user_id: userId } : {}),
    });
  if (answer.error) {
    return {
      ok: false,
      error:
        "Could not read where this organization keeps its tables, so no table was created — " +
        `making it in the wrong place would hide it from your screens. Try again. (${answer.error.message})`,
    };
  }
  const moved = answer.data === true || answer.data === "true";
  if (!moved) return { ok: true, store: "older", organizationId: org };
  return { ok: true, store: "record", home: { store: "record", organizationId: org, userId } };
}

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
  const org = await ensureOrgId(organizationId ?? null);
  const where = await whereThisTableLives(createClient(), org, tableId);
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
    const home = { organizationId: org, userId: await signedInUserId() };
    placeTableInRecordStore(tableId, home);
    return { ok: true, store: "record", home: { store: "record", ...home } };
  }
  return { ok: true, store: "older" };
}
