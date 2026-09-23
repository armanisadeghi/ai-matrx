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

export type OtherStore =
  | { kind: "record_store"; href: string }
  /**
   * The record store HOLDS this table and this person has not been given it. The store says
   * so itself (`custom.record_resolve` refuses 42501, "ask whoever holds it to share it with
   * you"), which is the truth: not missing, not deleted — not shared with them.
   */
  | { kind: "no_access" }
  | { kind: "nowhere" }
  /** The store was not reachable, which is NOT the same as "not there". */
  | { kind: "unknown"; why: string };

/**
 * Where `tableId` lives, for a person signed in and looking at `organizationId`.
 *
 * ASKED FIRST, BEFORE THE OLDER STORE IS READ (VERIFIER-16): a table the record store answers
 * for never reaches the older doors, which would otherwise answer a moved or unshared table
 * with a refusal (a 500 from `get_full_table`) and a sentence about deletion.
 *
 *   1. `custom.read_records_by_ids` over the Table kernel — the table, if this person may
 *      know it (the same ladder `/data-v2` uses). Found → `record_store`.
 *   2. `custom.record_resolve` — a 42501 refusal means the store holds that record and this
 *      person may not open it → `no_access`.
 *   3. Otherwise → `nowhere` (the caller then asks the older store).
 *
 * Returns `unknown` rather than `nowhere` on a transport failure, because telling somebody
 * their table does not exist when the truth is that we could not ask is the same lie in a
 * different sentence.
 */
export async function whereThisTableLives(
  client: SupabaseClient,
  organizationId: string,
  tableId: string,
): Promise<OtherStore> {
  const store = client.schema("custom" as never);

  const kernel = await store.rpc("table_kernel_id" as never, {} as never);
  if (kernel.error || typeof kernel.data !== "string") {
    return { kind: "unknown", why: kernel.error?.message ?? "the record store did not name its Table table" };
  }

  const found = await store.rpc("read_records_by_ids" as never, {
    p_organization_id: organizationId,
    p_table_id: kernel.data,
    p_record_ids: [tableId],
  } as never);
  if (found.error) return { kind: "unknown", why: found.error.message };
  if (((found.data ?? []) as Array<{ id?: string }>).some((row) => row.id === tableId)) {
    // The flag is how the new home knows to say, once, that the table moved — a redirect
    // that lands silently leaves a person wondering why their table looks different.
    return { kind: "record_store", href: `/data-v2/${tableId}?moved=older-table` };
  }

  const resolved = await store.rpc("record_resolve" as never, {
    p_organization_id: organizationId,
    p_id: tableId,
  } as never);
  if (resolved.error?.code === "42501") return { kind: "no_access" };
  return { kind: "nowhere" };
}
