/**
 * FAST TYPING LANDS WHOLE, ON ITS OWN ROW (BREAKER-2 B2-10 / B2-11, DATA-V2-BASICS-2).
 *
 * MEASURED on the Sheet: click a Therapist Notes cell, type "Alpha0" at 30 ms a key, Enter, "Alpha1",
 * Enter … — saved "Alpha0-g80", "-g80", "2-g80": the keys that arrived before the editor mounted were
 * dropped. And an edit whose save landed ~120 ms after the person had opened another cell ended THAT
 * edit and moved them; the typing then landed on another patient's Title.
 *
 * This harness is the Sheet's own pair — `useGridSelection` + `EditableCell` — over two rows. Each key is
 * one browser event (its own act, as React flushes a keydown), dispatched on the GRID, where a fast key
 * lands when the editor has not yet taken focus — exactly the 30 ms race. The store is stood in for, and
 * each save takes 120 ms.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: jest.fn(),
  readChoiceNudge: jest.fn().mockResolvedValue("ask"),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
// The cell's text box, without its voice and AI extras (which need the app's store).
jest.mock("@/components/official/ProTextarea", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const ProTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) =>
    React.createElement("textarea", { ...props, ref }),
  );
  return { ProTextarea };
});

import { EditableCell } from "../components/EditableCell";
import { useGridSelection } from "../hooks/useGridSelection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = ["r-grace", "r-mateo"];
const FIELDS = ["notes", "phone"];

const saidReadOnly = jest.fn();
function Grid({ editable = true }: { editable?: boolean } = {}) {
  const grid = useGridSelection({
    rowIds: ROWS,
    fieldNames: FIELDS,
    editable,
    onReadOnlyAttempt: saidReadOnly,
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
          {ROWS.map((rowId) => (
            <tr key={rowId}>
              {FIELDS.map((fieldName) => (
                <td key={fieldName} data-test-cell={`${rowId}:${fieldName}`} onClick={() => grid.select({ rowId, fieldName })}
                  onDoubleClick={() => grid.beginEdit({ rowId, fieldName })}>
                  <EditableCell
                    tableId="t-visits"
                    rowId={rowId}
                    fieldName={fieldName}
                    fieldDisplayName={fieldName}
                    dataType="string"
                    format={null}
                    value=""
                    display={<span />}
                    selected={grid.isSelected(rowId, fieldName)}
                    editing={grid.isEditing(rowId, fieldName)}
                    seed={grid.editSeed}
                    onSelect={() => grid.select({ rowId, fieldName })}
                    onBeginEdit={() => grid.beginEdit({ rowId, fieldName })}
                    onEndEdit={(move) => grid.endEdit(move, { rowId, fieldName })}
                    commitRequest={grid.isEditing(rowId, fieldName) ? grid.editCommit : null}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  upsertCell.mockReset().mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: { updated_at: "2026-09-29T20:00:00Z" } }), 120)),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const gridEl = () => container.querySelector("[data-test-grid]") as HTMLElement;
function key(k: string) {
  act(() => {
    gridEl().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
  // 30 ms later, the next key
  act(() => jest.advanceTimersByTime(30));
}
async function settle(ms = 0) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

it("types a whole word at 30 ms a key before the editor mounts, and Enter commits it", async () => {
  act(() => root.render(<Grid />));
  act(() => (container.querySelector('[data-test-cell="r-grace:notes"]') as HTMLElement).click());
  for (const k of "Alpha0") key(k);
  key("Enter");
  await settle(200);
  expect(upsertCell).toHaveBeenCalledWith(expect.objectContaining({ rowId: "r-grace", fieldName: "notes", value: "Alpha0" }));
});

it("a save that lands after the person opened another cell never moves them or ends that edit", async () => {
  act(() => root.render(<Grid />));
  act(() => (container.querySelector('[data-test-cell="r-grace:phone"]') as HTMLElement).click());
  for (const k of "555") key(k);
  key("Enter");
  await settle(0);
  // ~0 ms later, still inside the 120 ms save: a double-click on Mateo's Notes, and typing.
  act(() => {
    (container.querySelector('[data-test-cell="r-mateo:notes"]') as HTMLElement).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  for (const k of "j2@x.co") key(k);
  await settle(150); // the phone save lands
  key("Enter");
  await settle(200);
  const writes = upsertCell.mock.calls.map((c) => c[0] as { rowId: string; fieldName: string; value: unknown });
  expect(writes).toContainEqual(expect.objectContaining({ rowId: "r-grace", fieldName: "phone", value: "555" }));
  expect(writes).toContainEqual(expect.objectContaining({ rowId: "r-mateo", fieldName: "notes", value: "j2@x.co" }));
  expect(writes.filter((w) => w.value === "j2@x.co")).toHaveLength(1);
});

it("a viewer who types or presses Enter is told why nothing changes (B2-20)", async () => {
  saidReadOnly.mockReset();
  act(() => root.render(<Grid editable={false} />));
  act(() => (container.querySelector('[data-test-cell="r-grace:notes"]') as HTMLElement).click());
  key("Z");
  expect(saidReadOnly).toHaveBeenCalledTimes(1);
  expect(upsertCell).not.toHaveBeenCalled();
});
