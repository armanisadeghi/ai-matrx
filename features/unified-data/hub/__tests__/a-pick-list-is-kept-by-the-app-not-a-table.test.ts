// features/unified-data/hub/__tests__/a-pick-list-is-kept-by-the-app-not-a-table.test.ts
//
// A PICK LIST IS LISTED, AND SAYS IT IS A LIST (lane DATA-HOME-1, Arman 2026-09-27 21:40 PT).
//
// THE USE CASE: Rincon Plumbing's Service Calls table has a Status column; the store keeps its
// choices in a table of its own, "Status choices". Until this lane the data home hid that table
// behind "Show everything" (lane POST-PUBLISH-FE put it there). Arman's ruling: the home hides
// nothing — every table in the store is listed, each row saying its kind — so Tables lists Service
// Calls AND Status choices, the pick list marked with the store's own kind word, "list".
import { HUB_CAPABILITIES, withHubTableFacts, type HubReadContext } from "../capabilities";
import type { DataHomeTableRow, TableFactRow } from "../doors";
import type { Table } from "@ai-matrx/records";

const ME = "4cf62e4e-0000-4000-8000-00000000a001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";
const SERVICE_CALLS = "dbc7cd48-0000-4000-8000-000000000001";
const STATUS_CHOICES = "dbc7cd48-0000-4000-8000-000000000002";

const row = (over: Partial<DataHomeTableRow>): DataHomeTableRow => ({
  table_id: SERVICE_CALLS,
  table_name: "Rincon Plumbing — Service Calls",
  organization_id: RINCON,
  organization_name: "Rincon Plumbing Co",
  member: true,
  visibility: "internal",
  updated_at: "2026-09-27T15:40:00Z",
  mine: true,
  shared_with_me: false,
  kept_by_the_app: false,
  kind: "table",
  ...over,
});

const EVERYWHERE = [
  row({}),
  row({ table_id: STATUS_CHOICES, table_name: "Status choices", kept_by_the_app: true, kind: "list" }),
];

describe("the data home · a pick list is listed, as a list", () => {
  it("Tables lists Service Calls and the pick list, each with its kind", async () => {
    const tables = HUB_CAPABILITIES.find((c) => c.id === "tables")!;
    const read = await tables.read({ everywhere: { ok: true, rows: EVERYWHERE } } as unknown as HubReadContext);
    if (!read.ok) throw new Error("read failed");
    expect(read.items.map((i) => [i.title, i.kind])).toEqual([
      ["Rincon Plumbing — Service Calls", "table"],
      ["Status choices", "list"],
    ]);
  });

  it("there is no separate 'Kept by the app' listing on the home", () => {
    expect(HUB_CAPABILITIES.map((c) => c.id)).not.toContain("kept-by-the-app");
  });

  it("a Tables read the store refused is the listing's refusal, never an empty list", async () => {
    const tables = HUB_CAPABILITIES.find((c) => c.id === "tables")!;
    const read = await tables.read({
      everywhere: { ok: false, error: { message: "custom.data_home_tables did not answer." } },
    } as unknown as HubReadContext);
    expect(read.ok).toBe(false);
  });

  it("the organization's facts still fold onto its own Table list: Service Calls is mine", () => {
    const listed = [{ id: SERVICE_CALLS, name: "Rincon Plumbing — Service Calls", fields: [] }] as unknown as Table[];
    const facts = new Map<string, TableFactRow>([
      [SERVICE_CALLS, { table_id: SERVICE_CALLS, visibility: "internal", mine: true, kept_by_the_app: false }],
    ]);
    const [calls] = withHubTableFacts(listed, facts, ME);
    expect((calls as Table & { created_by?: string }).created_by).toBe(ME);
  });
});
