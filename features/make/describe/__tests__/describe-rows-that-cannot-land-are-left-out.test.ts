// features/make/describe/__tests__/describe-rows-that-cannot-land-are-left-out.test.ts
//
// THE USE CASE. "A content calendar for my 6 agency clients": the person already has Agency Clients and Posts. The answer reuses both,
// but the id it wrote for Posts is one block off, so Posts would be built NEW with example rows that point at client rows which the
// reused Agency Clients table never seeds. Live 2026-10-09 the install stopped with "Client is required".
// BREAKS THIS CATCHES: a reuse with a slipped id building a second table · example rows pointing at a bound table reaching the store.

import { bindReuses, dropOrphanRows, repairReuseIds } from "../describeTemplate";

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

describe("example rows that cannot land are left out, not installed to fail", () => {
  it("points a reuse whose id slipped at the one table with that exact name", () => {
    const reuses = [{ token: "post", existing_table_id: "22222222-0000-4000-8000-000000000000" }, { token: "agency_client", existing_table_id: existing[0]!.id }];
    expect(repairReuseIds(spec, reuses, existing).map((r) => r.existing_table_id)).toEqual([existing[1]!.id, existing[0]!.id]);
  });

  it("drops the rows of a new table that point at a table bound to an existing one, and says so", () => {
    const bound = bindReuses(spec, [{ token: "agency_client", existing_table_id: existing[0]!.id }], existing);
    const out = dropOrphanRows(bound);
    const post = out.spec.tables.find((t) => t.token === "post") as unknown as { rows: unknown[] };
    expect(post.rows).toEqual([]);
    expect(out.notes).toEqual(["Posts: example rows left out (they point at rows of a table you already have)."]);
  });

  it("keeps the rows when the tables they point at seed theirs", () => {
    const out = dropOrphanRows(spec);
    expect(out.notes).toEqual([]);
    expect((out.spec.tables[1] as unknown as { rows: unknown[] }).rows).toHaveLength(1);
  });
});
