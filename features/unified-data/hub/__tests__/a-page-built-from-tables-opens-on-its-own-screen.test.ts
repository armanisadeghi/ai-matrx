/**
 * v7 APPS-ON-DATA item 1 — PAGES FROM TABLES. A page is a dashboard record whose presentation says
 * kind "page" (records-ui `isPage`). The data home lists it as a Page and opens it on /data/pages/<id>;
 * a plain dashboard still opens on its table. The store door `custom.data_home_items` hands the
 * presentation (migration appsondata_a); without it every page was a dashboard.
 */
import { HUB_CAPABILITIES, type HubReadContext } from "../capabilities";
import type { DataHomeItemRow } from "../doors";

const ORG = "11111111-1111-1111-1111-111111111111";
const TABLE = "22222222-2222-2222-2222-222222222222";

function item(id: string, presentation: Record<string, unknown>): DataHomeItemRow {
  return {
    kind: "dashboard",
    organization_id: ORG,
    organization_name: "Cedar Ridge Physical Therapy",
    item_id: id,
    table_id: TABLE,
    table_name: "Referral Intake Queue",
    item_row: { dashboard_id: id, table_id: TABLE, name: id === "p1" ? "Today's intake" : "Weekly referrals", block_count: 1, presentation },
  };
}

describe("a page built from tables", () => {
  it("is listed as a Page and opens on its own screen; a dashboard still opens on its table", async () => {
    const dashboards = HUB_CAPABILITIES.find((c) => c.id === "dashboards")!;
    const ctx = {
      organizationId: null,
      tables: [],
      tableKernelId: null,
      items: {
        ok: true,
        rows: [
          item("p1", { kind: "page", page_blocks: [{ id: "a", kind: "list", table_id: TABLE }, { id: "b", kind: "record", source: "a" }] }),
          item("d1", {}),
        ],
      },
    } as unknown as HubReadContext;
    const read = await dashboards.read(ctx);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const page = read.items.find((i) => i.id === "p1")!;
    const dash = read.items.find((i) => i.id === "d1")!;
    expect(page).toMatchObject({ kind: "page", title: "Today's intake", href: "/data/pages/p1", facts: ["2 blocks"] });
    expect(dash.href).toBe(`/data/${TABLE}?dashboard=d1`);
    expect((dash as { kind?: string }).kind).toBeUndefined();
  });
});
