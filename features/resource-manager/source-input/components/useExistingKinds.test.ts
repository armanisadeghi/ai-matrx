/**
 * Use existing offers EXACTLY the registry's pickable kinds, in the registry's order
 * (`platform.entity_types.source_input_pickable` + `source_input_order`). Arman approved the list
 * on 2026-10-05: Files · Notes · Documents · Websites · Transcripts · Conversations · Tables ·
 * Workbooks · Saved results — one flat list. Kinds sharing an order are one entry.
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/unified-data/hub/doors", () => ({
  ...jest.requireActual("@/features/unified-data/hub/doors"),
  dataHomeTables: jest.fn(),
}));
jest.mock("@/features/data-tables/pick-lists/pick-list-index", () => ({
  ...jest.requireActual("@/features/data-tables/pick-lists/pick-list-index"),
  readPickListIndexOrThrow: jest.fn(),
}));

import { offeredKindsFrom } from "./UseExisting";
import { sourceInputEntries, type SourceInputKindRow } from "../sourceInputKinds";
import { fetchTablesPage, PICK_LIST_BADGE } from "../recordStoreKinds";
import { dataHomeTables } from "@/features/unified-data/hub/doors";
import { readPickListIndexOrThrow } from "@/features/data-tables/pick-lists/pick-list-index";

const LIVE: SourceInputKindRow[] = (
  [
    ["workbook", 8], ["file", 1], ["udt_document", 3], ["note", 2], ["document", 3], ["processed_document", 4],
    ["content_ir_kind_instance", 9], ["transcript", 5], ["dataset", 7], ["conversation", 6],
  ] as const
).map(([token, order]) => ({ token, label: token, order }));

describe("Use existing kinds", () => {
  it("are the registry's pickable kinds in the registry's order, Documents as one entry", () => {
    const kinds = offeredKindsFrom(sourceInputEntries(LIVE));
    expect(kinds.map((k) => k.plural)).toEqual([
      "Files", "Notes", "Documents", "Websites", "Transcripts", "Conversations", "Tables", "Workbooks", "Saved results",
    ]);
    const docs = kinds.find((k) => k.plural === "Documents")!;
    expect(docs.tokens).toEqual(["document", "udt_document"]);
  });

  it("lists Websites from saved Sources and Tables from the record store, one token each", () => {
    const byPlural = new Map(offeredKindsFrom(sourceInputEntries(LIVE)).map((k) => [k.plural, k]));
    expect(byPlural.get("Websites")).toMatchObject({ token: "processed_document", savedSourceGroup: "web_page" });
    expect(byPlural.get("Tables")).toMatchObject({ token: "dataset", recordStore: true, tokens: [] });
  });

  it("adds a kind with one registry setting: a new token shows, under its registry label, last", () => {
    const kinds = offeredKindsFrom(
      sourceInputEntries([...LIVE, { token: "rulebook", label: "Rulebook", order: null }]),
    );
    expect(kinds.at(-1)).toMatchObject({ plural: "Rulebook", token: "rulebook", tokens: ["rulebook"] });
  });

  it("lists tables and pick lists together, a pick list once and badged", async () => {
    const me = "user-me";
    const row = (id: string, name: string, mine: boolean, updated: string, kind = "table") => ({
      table_id: id, table_name: name, organization_id: "org-1", organization_name: "Harbor Logistics",
      member: true, visibility: "internal", updated_at: updated, mine, shared_with_me: false,
      platform_owned: false, kind,
    });
    (dataHomeTables as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        row("t-old", "Client roster", true, "2026-09-01T00:00:00Z"),
        row("t-new", "Vendor price sheet", false, "2026-10-01T00:00:00Z"),
        // The app's choice Table behind a choice column is the store's kind "list": never listed.
        row("c-1", "State choices", true, "2026-09-25T00:00:00Z", "list"),
        // A pick list the data home also lists as a table: shown once, as a pick list.
        row("l-1", "Deal stages", true, "2026-09-20T00:00:00Z"),
      ],
    });
    (readPickListIndexOrThrow as jest.Mock).mockResolvedValue({
      lists: [
        { id: "l-1", listName: "Deal stages", description: null, itemCount: 5, updatedAt: "2026-09-20T00:00:00Z", createdBy: me, organizationId: "org-1", organizationName: null },
      ],
      archivedIds: [],
    });
    const page = await fetchTablesPage({ scope: { kind: "all" }, userId: me, offset: 0, limit: 50 });
    expect(page.map((t) => [t.title, t.badge ?? null])).toEqual([
      ["Vendor price sheet", null],
      ["Deal stages", PICK_LIST_BADGE],
      ["Client roster", null],
    ]);
    const mine = await fetchTablesPage({ scope: { kind: "mine" }, userId: me, offset: 0, limit: 50 });
    expect(mine.map((t) => t.id)).toEqual(["l-1", "t-old"]);
    await fetchTablesPage({ scope: { kind: "organization", organizationId: "org-1" }, userId: me, offset: 0, limit: 50 });
    expect(dataHomeTables).toHaveBeenLastCalledWith(expect.anything(), "org-1");
    expect(readPickListIndexOrThrow).toHaveBeenLastCalledWith(expect.anything(), { organizationId: "org-1" });
  });
});
