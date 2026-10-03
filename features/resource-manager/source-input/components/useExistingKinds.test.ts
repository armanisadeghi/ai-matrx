/**
 * Use existing offers EXACTLY the kinds the organization page's Resources grid
 * shows under "Sources" and "Sources & Outputs", read from the grid's own
 * definition — never Utilities, Outputs or Workspaces, never the registry's
 * wider `content_role` set (Arman, 2026-09-30: "We want sources… Just a list
 * of the things that are in either sources or sources and outputs").
 */
jest.mock("@/features/data-tables/service", () => ({
  ...jest.requireActual("@/features/data-tables/service"),
  listTablesEverywhere: jest.fn(),
}));
jest.mock("@/features/user-lists/pick-list-index", () => ({
  ...jest.requireActual("@/features/user-lists/pick-list-index"),
  readPickListIndexOrThrow: jest.fn(),
}));

import { offeredKinds } from "./UseExisting";
import { fetchRecordStorePage } from "../recordStoreKinds";
import { listTablesEverywhere } from "@/features/data-tables/service";
import { readPickListIndexOrThrow } from "@/features/user-lists/pick-list-index";
import {
  CONTENT_ROLES,
  entriesByRole,
  SOURCE_CONTENT_ROLES,
} from "@/features/organizations/resource-catalogue";

describe("Use existing kinds", () => {
  it("are the grid's Sources + Sources & Outputs entries, in the grid's order", () => {
    // What the org page renders: one section per role, entriesByRole(role) in each.
    const gridSourceSections = CONTENT_ROLES.filter((r) =>
      (SOURCE_CONTENT_ROLES as readonly string[]).includes(r.id),
    ).flatMap((r) => entriesByRole(r.id).map((e) => e.labelPlural));
    expect(offeredKinds().map((k) => k.plural)).toEqual(gridSourceSections);
  });

  it("are the seven kinds the page shows (Files … Notes), Websites and Datasets included", () => {
    expect(offeredKinds().map((k) => k.plural)).toEqual([
      "Files",
      "Transcripts",
      "Websites",
      "Datasets",
      "Pick lists",
      "Workbooks",
      "Notes",
    ]);
  });

  it("gives every kind a way to count and list it (no grid kind is dropped)", () => {
    for (const k of offeredKinds()) {
      expect(k.token).toBeTruthy();
      if (k.plural === "Websites") {
        expect(k.token).toBe("processed_document");
        expect(k.savedSourceGroup).toBe("web_page");
      }
    }
    const byPlural = new Map(offeredKinds().map((k) => [k.plural, k]));
    // Datasets and Pick lists live in the record store: picked as the tokens the server resolves.
    expect(byPlural.get("Datasets")).toMatchObject({ token: "dataset", recordStoreKind: "table" });
    expect(byPlural.get("Pick lists")).toMatchObject({ token: "structured_list", recordStoreKind: "pick_list" });
  });

  it("lists the record store's rows for each record-store kind, Mine keeping what the person made", async () => {
    const me = "user-me";
    (listTablesEverywhere as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        { id: "t-old", table_name: "Client roster", description: null, row_count: 3, field_count: 2, user_id: me, updated_at: "2026-09-01T00:00:00Z" },
        { id: "t-new", table_name: "Vendor price sheet", description: null, row_count: 9, field_count: 4, user_id: "user-other", updated_at: "2026-10-01T00:00:00Z" },
      ],
    });
    (readPickListIndexOrThrow as jest.Mock).mockResolvedValue({
      lists: [
        { id: "l-1", listName: "Deal stages", description: null, itemCount: 5, updatedAt: "2026-09-20T00:00:00Z", createdBy: me, organizationId: "org-1", organizationName: null },
      ],
      archivedIds: [],
    });
    for (const k of offeredKinds().filter((k) => k.recordStoreKind)) {
      const page = await fetchRecordStorePage({ kind: k.recordStoreKind!, scope: { kind: "all" }, userId: me, offset: 0, limit: 50 });
      expect(page.length).toBeGreaterThan(0);
    }
    const tables = await fetchRecordStorePage({ kind: "table", scope: { kind: "all" }, userId: me, offset: 0, limit: 50 });
    expect(tables.map((t) => t.title)).toEqual(["Vendor price sheet", "Client roster"]);
    const mine = await fetchRecordStorePage({ kind: "table", scope: { kind: "mine" }, userId: me, offset: 0, limit: 50 });
    expect(mine.map((t) => t.id)).toEqual(["t-old"]);
    await fetchRecordStorePage({ kind: "pick_list", scope: { kind: "organization", organizationId: "org-1" }, userId: me, offset: 0, limit: 50 });
    expect(readPickListIndexOrThrow).toHaveBeenLastCalledWith(expect.anything(), { organizationId: "org-1" });
    const searched = await fetchRecordStorePage({ kind: "table", scope: { kind: "all" }, userId: me, query: "vendor", offset: 0, limit: 50 });
    expect(searched.map((t) => t.id)).toEqual(["t-new"]);
  });
});
