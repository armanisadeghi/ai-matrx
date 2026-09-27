/**
 * A TABLE IN BOTH STORES IS LISTED ONCE (merged-grid review 2, fix lane F item 3).
 *
 * `custom.table_list_everywhere` returned a both-store table twice (its record-store copy and its
 * older dataset, same id); the tables picker drew it twice and React threw a duplicate-key error.
 * `listTablesEverywhere` now keeps the row for the store the table lives in.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
  createClient: () => ({ schema: () => ({ rpc: (...args: unknown[]) => rpc(...args) }) }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "57f2a22b-5875-46c6-80df-437076421c28" }));

import { listTablesEverywhere } from "@/features/data-tables/service";

const BOTH = "b00bde4d-1adc-4682-88eb-57453aabf014";
const NEW_ONLY = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";

function answer(livesIn: "older" | "record") {
  rpc.mockImplementation(async (fn: string, args: { p_table_ids?: string[] }) => {
    if (fn === "table_list_everywhere") {
      return {
        data: {
          success: true,
          tables: [
            { id: NEW_ONLY, table_name: "September service board — Camarillo", store: "records" },
            { id: BOTH, table_name: "Hygiene Recall Schedule", store: "records", row_count: 40 },
            { id: BOTH, table_name: "Hygiene Recall Schedule", store: "older", row_count: 41 },
          ],
        },
        error: null,
      };
    }
    if (fn === "where_tables_live") {
      return { data: (args.p_table_ids ?? []).map((id) => ({ table_id: id, lives_in: livesIn, why: "" })), error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
}

describe("listTablesEverywhere — one row per table", () => {
  beforeEach(() => rpc.mockReset());

  it("lists a both-store table once, as the older table while it lives there", async () => {
    answer("older");
    const listed = await listTablesEverywhere();
    if (!listed.success) throw new Error(listed.error);
    expect(listed.data.map((t) => t.id)).toEqual([NEW_ONLY, BOTH]);
    expect(listed.data.find((t) => t.id === BOTH)?.store).toBe("older");
  });

  it("after the flip, keeps the record-store row", async () => {
    answer("record");
    const listed = await listTablesEverywhere();
    if (!listed.success) throw new Error(listed.error);
    expect(listed.data.filter((t) => t.id === BOTH)).toHaveLength(1);
    expect(listed.data.find((t) => t.id === BOTH)?.store).toBe("records");
  });
});
