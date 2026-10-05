/**
 * A TABLE / PICKLIST TILE'S BASICS CARRY CONTENT.
 *
 * Live failure (2026-10-04): a reloaded 6-item board, nothing selected. The agent knew the notes, the
 * task and the scope, but could only guess for the moving-boxes table ("likely tracking box inventory")
 * and the Rooms picklist: their basics were the name and a column COUNT (a brief turns a list into
 * `{ count }`), and a table that had not drawn kept only `{ type, name }`.
 */
jest.mock("@/components/official/icons/IconInputWithValidation.dynamic", () => ({ IconInputCompact: () => null }));
let captured: { getScope: () => Record<string, unknown> } | null = null;
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: (props: never) => {
    captured = props;
    return null;
  },
}));
const store: { table: unknown; fields: unknown[] } = { table: null, fields: [] };
jest.mock("@ai-matrx/records/react", () => ({
  useRecordsClient: () => null,
  useTable: () => ({ data: store.table }),
  useFields: () => ({ data: store.fields }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { surfaceBrief } from "@ai-matrx/chat/surfaces/runtime/surface-brief";
import { buildDataTablesScope } from "@/features/data-tables/agent-context/buildDataTablesScope";
import { dataTablesManifest } from "@/features/surfaces/manifests/data-tables.manifest";
import { RecordStoreTableSurface } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import { boardItemsOverview, createItemSurfaceIndex, sampleItemBasics, type BoardItemRow } from "../tools/item-surfaces";
import type { SurfaceRegistry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SURFACE = "matrx-user/data-tables";
const fields = [
  { field_name: "item", display_name: "Item", data_type: "text", field_order: 1, is_required: true },
  { field_name: "room", display_name: "Room", data_type: "text", field_order: 2, is_required: false },
  { field_name: "qty", display_name: "Boxes", data_type: "number", field_order: 3, is_required: false },
];
const loaded = buildDataTablesScope({
  tableId: "tbl-1",
  tableName: "Moving boxes",
  rowLabel: null,
  isReadOnly: false,
  fields,
  visibleRows: [
    { id: "r1", data: { item: "Kitchen plates", room: "Kitchen", qty: 3 } },
    { id: "r2", data: { item: "Winter coats", room: "Hall", qty: 2 } },
  ],
  totalCount: 14,
  searchTerm: "",
  fullDataset: null,
  openCell: null,
  openRow: null,
  selectedRows: [],
});
const capture = (scope: Record<string, unknown>) =>
  ({ primary: () => ({ surfaceName: SURFACE, getScope: () => scope }) }) as unknown as SurfaceRegistry;

describe("table tile basics", () => {
  it("a loaded table's brief has its name, column names, row count and first row", () => {
    const { values } = surfaceBrief(dataTablesManifest, loaded);
    const text = JSON.stringify(values);
    expect(values.table_name).toBe("Moving boxes");
    expect(values.row_count).toBe(14);
    expect(text).toContain("Item, Room, Boxes");
    expect(text).toContain("Kitchen plates");
  });

  it("the sampler keeps those basics for a loaded table", async () => {
    const index = createItemSurfaceIndex();
    index.set("t1", capture(loaded));
    const [kept] = await sampleItemBasics([{ id: "t1", title: "Moving boxes", kind: "table", surface: SURFACE }], index);
    expect(JSON.stringify(kept.basics.values)).toContain("Kitchen plates");
    expect(kept.basics.stale).toBeUndefined();
  });

  it("a never-loaded table still offers its name and column names, marked stale, and never a row count", async () => {
    store.table = { name: "Rooms" };
    store.fields = [{ key: "room", label: "Room" }, { key: "floor", label: "Floor" }];
    const host = document.createElement("div");
    act(() => {
      createRoot(host).render(
        <RecordStoreTableSurface channel={{ onGridContext: () => {}, latest: { current: null }, told: false }} tableId="tbl-2">
          <span />
        </RecordStoreTableSurface>,
      );
    });
    const scope = captured!.getScope();
    expect(scope).not.toHaveProperty("row_count");
    const index = createItemSurfaceIndex();
    index.set("t2", capture(scope));
    const rows: BoardItemRow[] = [{ id: "t2", title: "Rooms", kind: "list", surface: SURFACE, live: false }];
    const overview = await boardItemsOverview(rows, index);
    expect(overview.items[0].basics).toEqual({ table_name: "Rooms", brief_columns: "Room, Floor" });
    expect(overview.items[0].basics_stale).toBe(true);
    const [kept] = await sampleItemBasics([{ id: "t2", title: "Rooms", kind: "list", surface: SURFACE }], index);
    expect(kept.basics).toMatchObject({ values: { brief_columns: "Room, Floor" }, stale: true });
  });
});
