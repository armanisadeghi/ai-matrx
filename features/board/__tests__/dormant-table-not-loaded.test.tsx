/**
 * A DORMANT TABLE TILE SAYS "NOT LOADED YET" — never "0 rows, read-only".
 *
 * Use case: a person has a vendor-contacts table on the board that has not drawn yet (the tile is
 * asleep or the grid is still opening). The agent beside the board reads `board_items` /
 * `board_open_item`; before this lane the table's scope said row_count 0 (and the host's empty
 * snapshot said can't-write), which an agent reads as "an empty table I may not change".
 */
jest.mock("@/components/official/icons/IconInputWithValidation.dynamic", () => ({ IconInputCompact: () => null }));
let captured: { getScope: () => Record<string, unknown>; isEditable?: boolean } | null = null;
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: (props: never) => {
    captured = props;
    return null;
  },
}));
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => null }));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { RecordStoreTableSurface, gridHasLoaded } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import { SURFACE_NOT_LOADED_KEY } from "../tools/item-surfaces";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channel = (snapshot: unknown) => ({ onGridContext: () => {}, latest: { current: snapshot as never }, told: snapshot !== null });

function scopeFor(snapshot: unknown) {
  const host = document.createElement("div");
  act(() => {
    createRoot(host).render(
      <RecordStoreTableSurface channel={channel(snapshot)} tableId="tbl-1">
        <span />
      </RecordStoreTableSurface>,
    );
  });
  return captured!.getScope();
}

const EMPTY_SNAPSHOT = {
  tableId: "tbl-1", tableName: "", tableDescription: null, titleField: null, fields: [], rowActions: [],
  canWrite: false, currentCell: null, currentRow: null, selectedRange: null, selectedRows: [],
  visibleRows: [], total: null, search: "",
};

describe("dormant table tile", () => {
  it("no snapshot: no row_count, no is_read_only, and says not loaded", () => {
    const scope = scopeFor(null);
    expect(scope).not.toHaveProperty("row_count");
    expect(scope).not.toHaveProperty("is_read_only");
    expect(scope[SURFACE_NOT_LOADED_KEY]).toBe(true);
    expect(scope.table_id).toBe("tbl-1");
  });
  it("an empty not-yet-drawn snapshot (canWrite false) is not loaded either", () => {
    expect(gridHasLoaded(EMPTY_SNAPSHOT as never)).toBe(false);
    const scope = scopeFor(EMPTY_SNAPSHOT);
    expect(scope).not.toHaveProperty("row_count");
    expect(scope).not.toHaveProperty("is_read_only");
  });
  it("a loaded table with zero rows is still a real zero", () => {
    const scope = scopeFor({ ...EMPTY_SNAPSHOT, total: 0, fields: [{ id: "f", key: "name", label: "Name", type: "text" }], canWrite: true });
    expect(scope.row_count).toBe(0);
    expect(scope.is_read_only).toBe(false);
    expect(scope[SURFACE_NOT_LOADED_KEY]).toBeUndefined();
  });
});
