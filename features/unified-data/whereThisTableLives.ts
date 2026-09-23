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

/** How many Tables an organization can hold before this answer is partial. */
const TABLE_CEILING = 1000;

export type OtherStore =
  | { kind: "record_store"; href: string }
  | { kind: "nowhere" }
  /** The store was not reachable, which is NOT the same as "not there". */
  | { kind: "unknown"; why: string };

/**
 * Where `tableId` lives, for a person signed in and looking at `organizationId`.
 *
 * Returns `unknown` rather than `nowhere` on any refusal or transport failure,
 * because telling somebody their table does not exist when the truth is that we
 * could not ask is the same lie in a different sentence.
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

  const tables = await store.rpc("read_records" as never, {
    p_organization_id: organizationId,
    p_table_id: kernel.data,
    p_by_id: true,
    p_limit: TABLE_CEILING,
    p_offset: 0,
  } as never);
  if (tables.error) {
    return { kind: "unknown", why: tables.error.message };
  }

  const rows = (tables.data ?? []) as Array<{ id?: string }>;
  const found = rows.some((row) => row.id === tableId);
  // The flag is how the new home knows to say, once, that the table moved — a redirect
  // that lands silently leaves a person wondering why their table looks different.
  if (found) return { kind: "record_store", href: `/data-v2/${tableId}?moved=older-table` };

  // A partial page cannot say "nowhere": at the ceiling the answer is a page,
  // not the whole list, and this organization's table might be on page two.
  if (rows.length >= TABLE_CEILING) {
    return {
      kind: "unknown",
      why: `this organization has at least ${TABLE_CEILING} tables, so the list this read returned is a page rather than all of them`,
    };
  }
  return { kind: "nowhere" };
}
