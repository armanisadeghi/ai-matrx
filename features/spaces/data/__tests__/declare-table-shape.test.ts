// Pins the shape Spaces relies on from @ai-matrx/records: `declareTable` answers { ok: true, data: <table id string>, homeId }
// and `adoptPageDatabase` always sends p_target_id. A package change to either fails here, not on a live page.
import { declareTable, type RecordsClient } from "@ai-matrx/records/core";

import { adoptPageDatabase } from "../new-database";

const TABLE_ID = "a258c5aa-805f-4b5e-8939-b1072566f183";
const HOME_ID = "b1111111-0000-4000-8000-000000000001";

function stubClient(): RecordsClient {
  const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
  return {
    personKernelId: () => ok("11111111-0000-4000-8000-000000000005"),
    recordWrite: () => ok(HOME_ID),
    tableDeclare: () => ok(TABLE_ID),
    fieldDeclare: () => ok("c1111111-0000-4000-8000-000000000001"),
    recordDelete: () => ok(true),
  } as unknown as RecordsClient;
}

describe("declareTable answer shape (what Spaces reads)", () => {
  it("answers the table id as a plain string in data", async () => {
    const made = await declareTable(stubClient(), { name: "Projects", slug: "projects_x", titleField: "name", fields: [{ key: "name", label: "Name", type: "text", sort: 10, required: false }] });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(typeof made.data).toBe("string");
    expect(made.data).toBe(TABLE_ID);
    expect(typeof made.homeId).toBe("string");
  });
});

describe("adoptPageDatabase", () => {
  it("sends the table id as p_target_id", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    await adoptPageDatabase("page-1", TABLE_ID, { rpc });
    expect(rpc).toHaveBeenCalledWith("assoc_link", expect.objectContaining({ p_source_id: "page-1", p_target_id: TABLE_ID, p_target_type: "record" }));
  });
});
