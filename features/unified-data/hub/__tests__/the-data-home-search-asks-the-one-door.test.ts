// LANE DATA-HOME-3B — the data home's server search goes through the ONE door the home already calls
// (`custom.data_home`, now with `p_search`), never a second door, and hands the ranked rows back as
// the door ordered them.
import type { RecordsDataSource } from "@ai-matrx/records";

import { dataHomeSearch } from "../doors";

type Rpc = { fn: string; args: Record<string, unknown>; schema?: string };

function source(answer: unknown, calls: Rpc[]): RecordsDataSource {
  return {
    rpc: async (fn: string, args: Record<string, unknown>, opts?: { schema?: string }) => {
      calls.push({ fn, args, schema: opts?.schema });
      return { data: answer, error: null };
    },
  } as unknown as RecordsDataSource;
}

const ranked = {
  search: "Service Calls",
  tables: [
    { table_id: "t1", table_name: "Service Calls", match_rank: 10000, matched_in: "name", matched_field: null },
    { table_id: "t2", table_name: "Rincon Plumbing — Service Calls", match_rank: 3000, matched_in: "name", matched_field: null },
    { table_id: "t3", table_name: "Furnace jobs", match_rank: 300, matched_in: "field", matched_field: "Service calls this year" },
  ],
  items: [],
  changed_by: [],
};

describe("dataHomeSearch", () => {
  it("asks custom.data_home with p_search (trimmed) and the organization, and nothing else", async () => {
    const calls: Rpc[] = [];
    const answered = await dataHomeSearch(source(ranked, calls), "  Service Calls ", "org-1");
    expect(calls).toEqual([
      { fn: "data_home", args: { p_organization_id: "org-1", p_search: "Service Calls" }, schema: "custom" },
    ]);
    expect(answered.ok && answered.data.tables.map((t) => t.table_id)).toEqual(["t1", "t2", "t3"]);
    expect(answered.ok && answered.data.tables[2]?.matched_field).toBe("Service calls this year");
  });

  it("under All organizations sends no organization", async () => {
    const calls: Rpc[] = [];
    await dataHomeSearch(source(ranked, calls), "furnace");
    expect(calls[0]?.args).toEqual({ p_search: "furnace" });
  });

  it("a blank search sends nothing", async () => {
    const calls: Rpc[] = [];
    const answered = await dataHomeSearch(source(ranked, calls), "   ");
    expect(calls).toEqual([]);
    expect(answered).toEqual({ ok: true, data: { search: "", tables: [], items: [], changed_by: [] } });
  });

  it("a refusal comes back in the store's own words", async () => {
    const refusing = {
      rpc: async () => ({ data: null, error: { message: "custom.data_home searches at most 200 characters", hint: "Search for a shorter phrase." } }),
    } as unknown as RecordsDataSource;
    const answered = await dataHomeSearch(refusing, "x".repeat(201));
    expect(answered).toEqual({
      ok: false,
      error: { message: "custom.data_home searches at most 200 characters", hint: "Search for a shorter phrase." },
    });
  });
});
