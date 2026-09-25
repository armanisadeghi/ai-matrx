// features/unified-data/hub/__tests__/a-pick-list-is-kept-by-the-app-not-a-table.test.ts
//
// A PICK LIST IS KEPT BY THE APP, NOT ONE OF THE ORGANIZATION'S TABLES (lane POST-PUBLISH-FE).
//
// THE USE CASE: Rincon Plumbing's Service Calls table has a Status column; the store keeps its
// choices in a table of its own, "Status choices". On the organization hub the owner should see
// Service Calls under Tables, and "Status choices" only under "Kept by the app", behind Show
// everything. The Table list is built from each Table's DOCUMENT; whether the store keeps a table
// for itself is a `custom.table_facts` column (`kept_by_the_app`). Before this lane the hub
// folded only `visibility` and `mine` onto the list, so the pick list stayed under Tables.
import type { Table } from "@ai-matrx/records";

import { HUB_CAPABILITIES, withHubTableFacts, type HubReadContext } from "../capabilities";
import type { TableFactRow } from "../doors";

const ME = "4cf62e4e-0000-4000-8000-00000000a001";
const SERVICE_CALLS = "dbc7cd48-0000-4000-8000-000000000001";
const STATUS_CHOICES = "dbc7cd48-0000-4000-8000-000000000002";

const LISTED = [
  { id: SERVICE_CALLS, name: "Rincon Plumbing — Service Calls", slug: "rincon-service-calls", fields: [] },
  { id: STATUS_CHOICES, name: "Status choices", slug: "status-choices", fields: [] },
] as unknown as Table[];

const FACTS = new Map<string, TableFactRow>([
  [SERVICE_CALLS, { table_id: SERVICE_CALLS, visibility: "internal", mine: true, kept_by_the_app: false }],
  [
    STATUS_CHOICES,
    {
      table_id: STATUS_CHOICES,
      visibility: "internal",
      mine: true,
      kept_by_the_app: true,
      keeper_says: "The choices for Status on Service Calls.",
    },
  ],
]);

async function titles(capabilityId: string): Promise<string[]> {
  const capability = HUB_CAPABILITIES.find((c) => c.id === capabilityId)!;
  const ctx = {
    tables: withHubTableFacts(LISTED, FACTS, ME),
  } as unknown as HubReadContext;
  const read = await capability.read(ctx);
  if (!read.ok) throw new Error("read failed");
  return read.items.map((item) => item.title);
}

describe("the organization hub · a pick list sits under Kept by the app", () => {
  it("Tables lists Service Calls and not the pick list", async () => {
    expect(await titles("tables")).toEqual(["Rincon Plumbing — Service Calls"]);
  });

  it("Kept by the app lists the pick list", async () => {
    expect(await titles("kept-by-the-app")).toEqual(["Status choices"]);
  });

  it("the store's other facts still fold: Service Calls is mine and shared with the organization", () => {
    const [calls] = withHubTableFacts(LISTED, FACTS, ME);
    expect((calls as Table & { created_by?: string }).created_by).toBe(ME);
    expect((calls as Table & { visibility?: string }).visibility).toBe("internal");
  });
});
