// features/unified-data/whereThisTableLives.ts — WHICH STORE IS THIS ID IN?
//
// THE DEFECT THIS CLOSES. There are two table viewers: `/data/<id>` reads the
// older user-generated-table store (`workbench.udt_datasets`, through
// `public.get_full_table`) and `/data-v2/<id>` reads the record store
// (`custom.record`). They take the same shape of id in the same shape of URL,
// and every link, agent answer, bookmark and pasted address that named the
// wrong one answered:
//
//   "We couldn't open this dataset. It may have been deleted, or it may belong
//    to an organization you don't have access to."
//
// — a sentence that is false twice over for a record-store table the person
// owns and can open one route along. A screen is absent or honest, never a
// dead end wearing a plausible explanation.
//
// WHAT THIS ANSWERS. Given an id the older viewer could not open, is it a Table
// in the record store the signed-in person can reach? It asks the store's own
// client door and nothing else: `custom.read_records` over the kernel `Table`
// Table, which is exactly what `/data-v2` itself resolves a table id through.
// The door decides the caller and the row — there is no privileged path here.

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveObjectOrganization } from "./objectOrganization";
import { tableLivesIn } from "./tableLivesIn";

export type OtherStore =
  /** The record store holds it, in `organizationId` — the TABLE'S organization, never the caller's. */
  | { kind: "record_store"; href: string; organizationId: string }
  | { kind: "nowhere" }
  /** The store was not reachable, which is NOT the same as "not there". */
  | { kind: "unknown"; why: string };

/**
 * Where `tableId` lives, for the signed-in person. The table names its own organization
 * (`custom.where_id_opens`); no caller-supplied or active organization is ever consulted.
 *
 * ASKED FIRST, BEFORE THE OLDER STORE IS READ (VERIFIER-16): a table the record store answers
 * for never reaches the older doors, which would otherwise answer a moved or unshared table
 * with a refusal (a 500 from `get_full_table`) and a sentence about deletion.
 *
 *   1. `custom.where_id_opens` — the table, if this person may know it. Found → `record_store`.
 *   2. Otherwise → `nowhere` (the caller then asks the older store).
 *
 * Returns `unknown` rather than `nowhere` on a transport failure, because telling somebody
 * their table does not exist when the truth is that we could not ask is the same lie in a
 * different sentence.
 *
 * 0. FIRST, THE SWITCH (lane WHERE-LIVES-SWITCH, census row X1): `tableLivesIn` — the store's
 *    one answer, read from the organization's Data tables switch. "older" → `nowhere` (the caller
 *    reads and writes the older table), even when the record store holds a same-id copy: COPY
 *    mode keeps the older table the one in use until the owner presses the switch, and its copy
 *    is read-only. Step 1 below only ever runs for a table the switch says is the store's; it
 *    decides its organization and whether this person may open it, never which store it is in.
 */
export async function whereThisTableLives(
  client: SupabaseClient,
  tableId: string,
): Promise<OtherStore> {
  const home = await tableLivesIn(client, tableId);
  if (!home.ok) return { kind: "unknown", why: home.why };
  if (home.livesIn === "older") return { kind: "nowhere" };

  // THE TABLE NAMES ITS OWN ORGANIZATION. Zero rows is "not a record-store table this person
  // was given" — which, here, is "ask the older store"; the older viewer then says, honestly,
  // that it is in neither.
  const own = await resolveObjectOrganization(
    {
      rpc: (fn, args, opts) =>
        client.schema((opts?.schema ?? "custom") as never).rpc(fn as never, args as never) as never,
    },
    tableId,
  );
  if (own.state === "found" && own.kind === "table") {
    return { kind: "record_store", href: `/data-v2/${tableId}`, organizationId: own.organizationId };
  }
  if (own.state === "found" || own.state === "not-given") return { kind: "nowhere" };
  return { kind: "unknown", why: own.state === "unavailable" ? own.why : "the record store did not say where this table lives" };
}
