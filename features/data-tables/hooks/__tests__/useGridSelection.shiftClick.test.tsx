/**
 * SHIFT-CLICK EXTENDS FROM THE ANCHOR (grid-parity `select.range`, defect #1).
 *
 * Spreadsheet law: clicking a cell sets the anchor; shift-clicking another
 * cell extends the RANGE from that anchor to the new cell — the anchor never
 * moves. The parity harness caught the old grid doing the opposite: a plain
 * click on `Job 006 / Job` followed by a shift-click on `Job 008 / Owner`
 * copied a single cell (`Cleo`) instead of the 3-row-by-2-column block a
 * spreadsheet would produce.
 */
import { renderHook } from "@/test-utils/renderHook";
import { useGridSelection } from "../useGridSelection";
import { cellsInRange } from "../../grid-selection";

const ROW_IDS = ["r1", "r2", "r3", "r4"];
const FIELD_NAMES = ["job", "status", "owner"];

function makeHarness() {
  return renderHook(() =>
    useGridSelection({
      rowIds: ROW_IDS,
      fieldNames: FIELD_NAMES,
      editable: true,
      getCellText: () => "",
      onClearCells: () => {},
      onPasteText: () => {},
      onUndo: () => {},
      onRedo: () => {},
    }),
  );
}

describe("useGridSelection — shift-click", () => {
  it("keeps the first click as the anchor and extends the range to the shift-click", async () => {
    const handle = await makeHarness();

    // Plain click on r2/job — this is the anchor.
    await handle.act(() => handle.current.select({ rowId: "r2", fieldName: "job" }));
    expect(handle.current.selected).toEqual({ rowId: "r2", fieldName: "job" });
    expect(handle.current.range).toBeNull();

    // Shift-click on r4/owner — extends FROM r2/job, does not move the anchor.
    await handle.act(() => handle.current.extendTo({ rowId: "r4", fieldName: "owner" }));

    expect(handle.current.selected).toEqual({ rowId: "r2", fieldName: "job" });
    expect(handle.current.range).toEqual({
      anchor: { rowId: "r2", fieldName: "job" },
      focus: { rowId: "r4", fieldName: "owner" },
    });

    const block = cellsInRange(handle.current.range!, ROW_IDS, FIELD_NAMES);
    // A spreadsheet-law range: 3 rows (r2..r4) x 3 columns (job..owner) = 9 cells.
    expect(block).toHaveLength(9);
    expect(block[0]).toEqual({ rowId: "r2", fieldName: "job" });
    expect(block[block.length - 1]).toEqual({ rowId: "r4", fieldName: "owner" });
  });

  it("a second shift-click extends further from the SAME anchor, not from the last focus", async () => {
    const handle = await makeHarness();

    await handle.act(() => handle.current.select({ rowId: "r1", fieldName: "status" }));
    await handle.act(() => handle.current.extendTo({ rowId: "r2", fieldName: "status" }));
    await handle.act(() => handle.current.extendTo({ rowId: "r4", fieldName: "job" }));

    // If shift-click moved the anchor (the defect), this would be r2/status.
    expect(handle.current.selected).toEqual({ rowId: "r1", fieldName: "status" });
    expect(handle.current.range?.anchor).toEqual({ rowId: "r1", fieldName: "status" });
    expect(handle.current.range?.focus).toEqual({ rowId: "r4", fieldName: "job" });
  });
});
