// features/unified-data/hub/__tests__/who-changed-it-reads-every-organization.test.ts
//
// LANE DATA-HOME-2 (chair, 2026-09-28): under All Orgs the data home lists Harbor Dental's dashboard
// beside Rincon Plumbing's while the owner works in Rincon Plumbing. "Who changed it" was asked of
// the WORKING organization only, so every other organization's row showed no name. RED on the
// tail-1 capabilities: attachChangedBy asked custom.hub_changed_by for the working organization only.
const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";

const asked: unknown[] = [];
jest.mock("../doors", () => ({
  changedBy: async (_ds: unknown, organizationId: string, kind: string, ids: string[]) => {
    asked.push({ organizationId, kind, ids });
    return { ok: true, data: [] };
  },
  dataHomeChangedBy: async (_ds: unknown, asks: Array<{ organization_id: string; kind: string; ids: string[] }>) => {
    asked.push(...asks);
    return {
      ok: true,
      data: asks.flatMap((a) =>
        a.ids.map((id) => ({
          organization_id: a.organization_id,
          id,
          at: "2026-09-28T17:00:00Z",
          who: a.organization_id === HARBOR ? "Dr. Lena Ortiz" : "Marco Reyes",
        })),
      ),
    };
  },
}));

import { attachChangedBy, HUB_CAPABILITIES, type HubItem, type HubReadContext } from "../capabilities";

it("asks each row's own organization, in one call, and names who changed every row", async () => {
  const dashboards = HUB_CAPABILITIES.find((c) => c.id === "dashboards")!;
  const items: HubItem[] = [
    { id: "d1", title: "Recalls due this month", tableId: null, tableName: null, lane: null, facts: [], href: "/", organizationId: HARBOR },
    { id: "d2", title: "Open service calls", tableId: null, tableName: null, lane: null, facts: [], href: "/", organizationId: RINCON },
  ];
  await attachChangedBy({ organizationId: RINCON, dataSource: {} } as unknown as HubReadContext, dashboards, items);
  expect(asked).toEqual([
    { organization_id: HARBOR, kind: "structure", ids: ["d1"] },
    { organization_id: RINCON, kind: "structure", ids: ["d2"] },
  ]);
  expect(items.map((i) => i.changedBy)).toEqual(["Dr. Lena Ortiz", "Marco Reyes"]);
});
