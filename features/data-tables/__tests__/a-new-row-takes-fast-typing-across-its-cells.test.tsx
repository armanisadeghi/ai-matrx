/**
 * GRIDS REVIEW 3: "+ Row" then fast Tab-typing lost five of six values. Measured again on the inline row
 * (2026-10-03, loaded preview): the first cell kept its words and every key after the first Tab was lost.
 * The Sheet's own pair — `useGridSelection` + `EditableCell` — with `useInlineNewRow`; the store is stood
 * in for and makes the row 200 ms after "+ Row"; every key is typed during that wait.
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
jest.mock("@/components/official/ProTextarea", () => {
  const R = jest.requireActual("react") as typeof import("react");
  return { ProTextarea: R.forwardRef<HTMLTextAreaElement, R.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => R.createElement("textarea", { ...props, ref })) };
});

import { EditableCell } from "../components/EditableCell";
import { useGridSelection } from "../hooks/useGridSelection";
import { useInlineNewRow } from "../hooks/useInlineNewRow";

// The flow runs on its own clock (the store's answer, the re-read, frames), so React schedules for
// real here instead of queueing every update inside one long act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const FIELDS = ["title", "asset_tag", "notes"];
let addRow: () => void = () => {};

function Sheet() {
  const [rows, setRows] = React.useState<string[]>(["r-biodex"]);
  const rowsNow = React.useRef(rows);
  rowsNow.current = rows;
  const grid = useGridSelection({
    rowIds: rows,
    fieldNames: FIELDS,
    editable: true,
    onReadOnlyAttempt: () => {},
    getCellText: () => "",
    onClearCells: () => {},
    onPasteText: () => {},
    onUndo: () => {},
    onRedo: () => {},
  });
  const inline = useInlineNewRow({
    containerRef: grid.containerRef,
    create: () => new Promise((r) => setTimeout(() => r({ ok: true, rowId: "r-new" }), 200)),
    reload: async () => setRows((prev) => [...prev, "r-new"]),
    shownRowIds: () => rowsNow.current,
    begin: (rowId, seed) => {
      grid.beginEdit({ rowId, fieldName: "title" }, seed === "" ? undefined : seed);
      return true;
    },
    focusGrid: () => grid.refocusGrid(),
    onRefused: () => {},
    onNotShown: () => {},
  });
  addRow = () => void inline.start();
  return (
    <div ref={grid.containerRef} tabIndex={0} onKeyDown={grid.onKeyDown} data-test-grid="">
      <textarea {...grid.typeCatcherProps} />
      <table>
        <tbody>
          {rows.map((rowId) => (
            <tr key={rowId}>
              {FIELDS.map((fieldName) => (
                <td key={fieldName}>
                  <EditableCell
                    tableId="t-equipment"
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
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-10-03T20:00:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("lands every value typed across the new row while the store was still making it", async () => {
  act(() => root.render(<Sheet />));
  act(() => addRow());
  // Typed at once, before the row exists — the keys reach whatever has focus (the grid's catcher).
  const target = () => (document.activeElement as HTMLElement) ?? document.body;
  for (const k of "Treadmill\t10601\tBelt checked\n".split("")) {
    const key = k === "\t" ? "Tab" : k === "\n" ? "Enter" : k;
    act(() => {
      target().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }
  await new Promise((r) => setTimeout(r, 4000));
  const written = upsertCell.mock.calls.map((c) => `${(c[0] as { rowId: string }).rowId}.${(c[0] as { fieldName: string }).fieldName}=${(c[0] as { value: unknown }).value}`);
  expect(written).toEqual(["r-new.title=Treadmill", "r-new.asset_tag=10601", "r-new.notes=Belt checked"]);
}, 15000);
