/**
 * GRIDS REVIEW 3 (2026-09-30), on the Sheet: Space on a selected tick box did nothing, a digit typed on a
 * selected rating was lost, and a date & time typed before the calendar mounted (`1200PM`) was sent raw
 * and saved nothing with nothing said. The Sheet's own pair — `useGridSelection` + `EditableCell` — with
 * each key one browser event on the grid, the store stood in for.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: jest.fn(),
  readChoiceNudge: jest.fn().mockResolvedValue("ask"),
  isRecordStoreTable: () => true,
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { EditableCell } from "../components/EditableCell";
import { useGridSelection } from "../hooks/useGridSelection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Col = { name: string; dataType: string; format: { id: string; options?: Record<string, unknown> } | null; value: unknown };

function Grid({ col, toggle }: { col: Col; toggle?: number | null }) {
  const grid = useGridSelection({
    rowIds: ["r1"],
    fieldNames: [col.name],
    editable: true,
    onReadOnlyAttempt: () => {},
    getCellText: () => "",
    onClearCells: () => {},
    onPasteText: () => {},
    onUndo: () => {},
    onRedo: () => {},
  });
  return (
    <div ref={grid.containerRef} tabIndex={0} onKeyDown={grid.onKeyDown} data-test-grid="">
      <textarea {...grid.typeCatcherProps} />
      <table>
        <tbody>
          <tr>
            <td data-test-cell="" onClick={() => grid.select({ rowId: "r1", fieldName: col.name })}>
              <EditableCell
                tableId="t-equipment"
                rowId="r1"
                fieldName={col.name}
                fieldDisplayName={col.name}
                dataType={col.dataType as never}
                format={col.format as never}
                value={col.value}
                display={<span />}
                selected={grid.isSelected("r1", col.name)}
                editing={grid.isEditing("r1", col.name)}
                seed={grid.editSeed}
                onSelect={() => grid.select({ rowId: "r1", fieldName: col.name })}
                onBeginEdit={() => grid.beginEdit({ rowId: "r1", fieldName: col.name })}
                onEndEdit={(move) => grid.endEdit(move, { rowId: "r1", fieldName: col.name })}
                commitRequest={grid.isEditing("r1", col.name) ? grid.editCommit : null}
                toggleRequest={toggle ?? null}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-10-03T20:00:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const key = (k: string) =>
  act(() => {
    (container.querySelector("[data-test-grid]") as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

it("a toggle request (Space on the selected tick box) ticks it, once per press", async () => {
  const col: Col = { name: "Calibrated", dataType: "boolean", format: null, value: false };
  act(() => root.render(<Grid col={col} toggle={null} />));
  act(() => root.render(<Grid col={col} toggle={1} />));
  await settle();
  expect(upsertCell).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "Calibrated", value: true }));
  act(() => root.render(<Grid col={col} toggle={1} />));
  await settle();
  expect(upsertCell).toHaveBeenCalledTimes(1);
});

it("a digit typed on a selected rating sets that many stars", async () => {
  const col: Col = { name: "Condition score", dataType: "number", format: { id: "rating", options: { ratingMax: 5 } }, value: null };
  act(() => root.render(<Grid col={col} />));
  act(() => (container.querySelector("[data-test-cell]") as HTMLElement).click());
  key("4");
  await settle();
  expect(upsertCell).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "Condition score", value: 4 }));
});

it("a time typed into a date & time cell before the calendar opened keeps the day and is stored as an instant", async () => {
  const prior = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const col: Col = { name: "Serviced at", dataType: "datetime", format: null, value: "2026-10-03T16:00:00.000Z" };
    act(() => root.render(<Grid col={col} />));
    act(() => (container.querySelector("[data-test-cell]") as HTMLElement).click());
    for (const k of "1200PM") key(k);
    key("Enter");
    await settle();
    expect(upsertCell).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "Serviced at", value: "2026-10-03T19:00:00.000Z" }));
  } finally {
    process.env.TZ = prior;
  }
});
