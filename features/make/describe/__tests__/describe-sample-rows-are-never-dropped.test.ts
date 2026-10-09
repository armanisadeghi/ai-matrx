// features/make/describe/__tests__/describe-rows-that-cannot-land-are-left-out.test.ts
//
// THE USE CASE. "A content calendar for my 6 agency clients": the person already has Agency Clients and Posts. The answer reuses both,
// but the id it wrote for Posts is one block off, so Posts would be built NEW with example rows that point at client rows which the
// reused Agency Clients table never seeds. Live 2026-10-09 the install stopped with "Client is required".
// BREAKS THIS CATCHES: a reuse with a slipped id building a second table · example rows pointing at a bound table reaching the store.

import { bindReuses, landReusedRows, repairReuseIds } from "../describeTemplate";

const existing = [
  { id: "11111111-aaaa-4aaa-8aaa-111111111111", name: "Agency Clients", fields: [{ key: "client", label: "Client", kind: "text" }] },
  { id: "22222222-bbbb-4bbb-8bbb-222222222222", name: "Posts", fields: [{ key: "title", label: "Title", kind: "text" }] },
];
const spec = {
  tables: [
    { token: "agency_client", name: "Agency Clients", fields: [{ key: "client", parityType: "text" }], rows: [{ key: "harbor", values: { client: "Harbor Bistro" } }] },
    {
      token: "post",
      name: "Posts",
      fields: [{ key: "title", parityType: "text" }, { key: "client", parityType: "relation", relationTarget: "agency_client" }],
      rows: [{ key: "fall", values: { title: "Fall menu", client: "harbor" } }],
    },
  ],
} as never;

describe("a sample row is never dropped: reused tables are seeded or linked", () => {
  it("points a reuse whose id slipped at the one table with that exact name", () => {
    const reuses = [{ token: "post", existing_table_id: "22222222-0000-4000-8000-000000000000" }, { token: "agency_client", existing_table_id: existing[0]!.id }];
    expect(repairReuseIds(spec, reuses, existing).map((r) => r.existing_table_id)).toEqual([existing[1]!.id, existing[0]!.id]);
  });

  const clientsId = existing[0]!.id;
  const bound = () => bindReuses(spec, [{ token: "agency_client", existing_table_id: clientsId }], existing);
  const bindOf = (out: { spec: { tables: unknown[] } }) => (out.spec.tables[0] as { bindsTo: { seedRows?: boolean; rowIds?: Record<string, string> } }).bindsTo;
  const postRows = (out: { spec: { tables: unknown[] } }) => (out.spec.tables[1] as { rows: unknown[] }).rows;

  it("an EMPTY reused table is seeded with the template's sample rows, so the example posts keep their client", () => {
    const out = landReusedRows(bound(), { [clientsId]: { total: 0, rows: [] } });
    expect(bindOf(out).seedRows).toBe(true);
    expect(postRows(out)).toHaveLength(1);
    expect(out.notes).toEqual(["Agency Clients: 1 example row is added to your empty table."]);
  });

  it("a reused table WITH rows: a sample row finds its existing row by name; the link lands on it", () => {
    const out = landReusedRows(bound(), { [clientsId]: { total: 2, rows: [{ id: "row-harbor", words: ["Harbor Bistro"] }, { id: "row-x", words: ["Other"] }] } });
    expect(bindOf(out).rowIds).toEqual({ harbor: "row-harbor" });
    expect(postRows(out)).toHaveLength(1);
    expect(out.notes).toEqual([]);
  });

  it("no match: the example post is KEPT, only its client link is left empty, and one note says so", () => {
    const out = landReusedRows(bound(), { [clientsId]: { total: 1, rows: [{ id: "row-x", words: ["Someone Else"] }] } });
    expect(bindOf(out).rowIds).toEqual({});
    expect(postRows(out)).toHaveLength(1);
    expect(out.notes).toEqual(["Agency Clients: 1 example link left empty (nothing in your table matches it); the example rows themselves are kept."]);
  });

  it("changes nothing when nothing is reused", () => {
    const out = landReusedRows(spec, {});
    expect(out.notes).toEqual([]);
    expect(out.spec).toBe(spec);
  });
});
