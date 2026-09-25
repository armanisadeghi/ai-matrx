// features/unified-data/__tests__/a-copied-table-is-the-older-table-until-the-switch.test.ts
//
// LANE WHERE-LIVES-SWITCH (census row X1) — WHERE A TABLE LIVES IS ITS ORGANIZATION'S SWITCH.
//
// THE USE CASE. admin@admin.com appends a chat answer to "Heat Pump Field Research", an older
// table in admin's Workspace. COPY mode made a same-id copy of it in the record store, and the
// owner has not pressed the Data tables switch. `custom.where_id_opens` finds the copy (a Table
// he may open) — which is exactly why every resolver used to route the append into the COPY.
// The store's one answer, `custom.where_tables_live`, says "older": the append must go to the
// older table, so `whereThisTableLives` answers `nowhere` and `locateTable` answers `older`.
//
// RED on the tree before this lane: `whereThisTableLives` answered `record_store` from the copy.
// The client below is the supabase-js surface the function calls (`schema().rpc()`), answering
// what production answers for this table today.

import type { SupabaseClient } from "@supabase/supabase-js";

import { whereThisTableLives } from "../whereThisTableLives";

const HEAT_PUMP = "5d1c7e2a-4b6f-4c1d-9a2e-8f0b3c5d7e91";
const ADMIN_WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

type Answer = { data: unknown; error: { code?: string; message: string } | null };

function clientAnswering(livesIn: "older" | "record" | Error): { client: SupabaseClient; asked: string[] } {
  const asked: string[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<Answer> => {
    asked.push(fn);
    if (fn === "where_tables_live") {
      if (livesIn instanceof Error) return { data: null, error: { message: livesIn.message } };
      const ids = args.p_table_ids as string[];
      return { data: ids.map((id) => ({ table_id: id, lives_in: livesIn, why: `it answers ${livesIn}` })), error: null };
    }
    if (fn === "where_id_opens") {
      // The copy exists and this person may open it — the fact that fooled every resolver.
      return { data: { kind: "table", organization_id: ADMIN_WORKSPACE, path: `/data-v2/${HEAT_PUMP}`, live: true }, error: null };
    }
    return { data: null, error: { message: `unexpected door ${fn}` } };
  };
  const client = { schema: () => ({ rpc }), rpc } as unknown as SupabaseClient;
  return { client, asked };
}

describe("a copied table is read and written where its organization's switch says", () => {
  it("switch off: the older table is the one in use, even though the store holds a same-id copy", async () => {
    const { client, asked } = clientAnswering("older");
    const where = await whereThisTableLives(client, ADMIN_WORKSPACE, HEAT_PUMP);
    expect(where).toEqual({ kind: "nowhere" });
    expect(asked[0]).toBe("where_tables_live");
  });

  it("switch on: the copy is the table", async () => {
    const { client } = clientAnswering("record");
    const where = await whereThisTableLives(client, ADMIN_WORKSPACE, HEAT_PUMP);
    expect(where).toEqual({ kind: "record_store", href: `/data-v2/${HEAT_PUMP}`, organizationId: ADMIN_WORKSPACE });
  });

  it("the switch could not be read: says so, never guesses a store", async () => {
    const { client } = clientAnswering(new Error("connection reset"));
    const where = await whereThisTableLives(client, ADMIN_WORKSPACE, HEAT_PUMP);
    expect(where).toEqual({ kind: "unknown", why: "connection reset" });
  });
});
