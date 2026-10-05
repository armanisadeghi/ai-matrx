// features/unified-data/whereThisTableLives.ts — WHERE DOES THIS TABLE OPEN, FOR THIS PERSON?
//
// Every table lives in the record store (`custom.*`). What a caller still needs is the TABLE'S
// organization — the store's doors are keyed (organization, id) — and whether this person may
// open it at all. Both come from one door, `custom.where_id_opens` (through
// `resolveObjectOrganization`), which reads the organization from the object's own id and answers
// only when the person could already open it. No caller-supplied or active organization is ever
// consulted.

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveObjectOrganization } from "./objectOrganization";

export type OtherStore =
  /** The record store holds it, in `organizationId` — the TABLE'S organization, never the caller's. */
  | { kind: "record_store"; href: string; organizationId: string }
  /** Not a table this person may open (the store does not tell a guessed id from a hidden one). */
  | { kind: "nowhere" }
  /** The store was not reachable, which is NOT the same as "not there". */
  | { kind: "unknown"; why: string };

/**
 * Where `tableId` opens for the signed-in person. Returns `unknown` rather than `nowhere` on a
 * transport failure: telling somebody their table does not exist when the truth is that we could
 * not ask is a lie.
 */
export async function whereThisTableLives(client: SupabaseClient, tableId: string): Promise<OtherStore> {
  const own = await resolveObjectOrganization(
    {
      rpc: (fn, args, opts) =>
        client.schema((opts?.schema ?? "custom") as never).rpc(fn as never, args as never) as never,
    },
    tableId,
  );
  if (own.state === "found" && own.kind === "table") {
    return { kind: "record_store", href: `/data/${tableId}`, organizationId: own.organizationId };
  }
  if (own.state === "found" || own.state === "not-given") return { kind: "nowhere" };
  return { kind: "unknown", why: own.state === "unavailable" ? own.why : "the record store did not say where this table lives" };
}
