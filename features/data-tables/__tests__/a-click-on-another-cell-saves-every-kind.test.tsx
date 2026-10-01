/**
 * A CLICK ON ANOTHER CELL SAVES WHAT WAS TYPED — EVERY KIND (lane TABLE-EDIT-DEFECTS, T28; safety net
 * live-0419-before on www as admin@admin.com: "the editor held 'Band above the knees, 3 x 12'; right
 * after the click-off the cell read '—'; after a reload '—'"). Reproduced on the clone preview for a
 * Text, Number, Date and Choice cell alike.
 *
 * CAUSE: a press on another cell SELECTS it, and selecting ends the edit in the same render
 * (`useGridSelection.select` → editing null). The editor unmounts before the browser moves focus, so
 * its own blur (text, number) or its calendar's "pointer down outside" (date) never fires, and only a
 * choice edit had a commit-on-end. This test stands where the grid does: it types into the REAL editor,
 * then re-renders the cell with `editing={false}` — exactly what the grid's select does — with no blur.
 * Only the network (`../service`) is stood in for.
 *
 * RED on the HEAD bytes: text, number, date and datetime saved nothing (upsertCell never called).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: jest.fn(),
  readChoiceNudge: jest.fn(async () => "ask"),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
// The platform text field needs the app's store for its "…" menu; a plain textarea stands in for it —
// the commit-on-end logic under test is EditableCell's, not the field's.
jest.mock("@/components/official/ProTextarea", () => {
  const React = jest.requireActual("react");
  const Plain = React.forwardRef(function Plain(
    props: Record<string, unknown>,
    ref: React.Ref<HTMLTextAreaElement>,
  ) {
    const { autoGrow: _a, showCopyButton: _b, enableVoice: _c, ...rest } = props;
    return React.createElement("textarea", { ...rest, ref });
  });
  return { __esModule: true, default: Plain, ProTextarea: Plain };
});

import { EditableCell } from "../components/EditableCell";
import type { FieldDataType } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-10-01T12:40:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

type Kind = { fieldName: string; label: string; dataType: FieldDataType; format?: { id: string; options?: Record<string, unknown> } | null };

function cell(kind: Kind, editing: boolean) {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <EditableCell
              tableId="7a67d78f-6f5f-47d9-afe6-b0a80e4621ba"
              rowId="514b2acd-3cf7-42f2-b235-cf212c8f044a"
              fieldName={kind.fieldName}
              fieldDisplayName={kind.label}
              dataType={kind.dataType}
              format={(kind.format ?? null) as never}
              value={null}
              display={<span>—</span>}
              editing={editing}
              onEndEdit={jest.fn()}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Type the words into the open editor the way React hears a person type (native setter + input). */
function typeInto(box: HTMLInputElement | HTMLTextAreaElement, words: string) {
  const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(box, words);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

async function typeThenClickAnotherCell(kind: Kind, words: string) {
  await act(async () => {
    root.render(cell(kind, true));
    await Promise.resolve();
  });
  const box = (container.querySelector("textarea") ?? container.querySelector("input")) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(box).not.toBeNull();
  await act(async () => {
    typeInto(box!, words);
    await Promise.resolve();
  });
  // The grid selected another cell: the edit ends in the same render, no blur ever reaches the box.
  await act(async () => {
    root.render(cell(kind, false));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

const saved = () => upsertCell.mock.calls.map((c) => (c[0] as { value: unknown }).value);

it("a Text cell saves its words", async () => {
  await typeThenClickAnotherCell({ fieldName: "session_notes", label: "Session Notes", dataType: "string" }, "Band above the knees, 3 x 12");
  expect(saved()).toEqual(["Band above the knees, 3 x 12"]);
});

it("a Number cell saves its number", async () => {
  await typeThenClickAnotherCell({ fieldName: "reps", label: "Reps", dataType: "number", format: { id: "number" } }, "12");
  expect(saved()).toEqual([12]);
});

it("a Date cell saves its day", async () => {
  await typeThenClickAnotherCell({ fieldName: "first_visit", label: "First Visit", dataType: "date", format: { id: "date" } }, "10/6/2026");
  expect(saved()).toHaveLength(1);
  expect(String(saved()[0])).toMatch(/^2026-10-06/);
});

it("a Date & time cell saves its day and time", async () => {
  await typeThenClickAnotherCell({ fieldName: "next_check_in", label: "Next Check-in", dataType: "datetime", format: { id: "datetime" } }, "10/13/2026 9:30 AM");
  expect(saved()).toHaveLength(1);
  const at = new Date(String(saved()[0]));
  expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 10, 13, 9, 30]);
});

it("a Number cell holding words is refused on the cell, never saved as empty in silence", async () => {
  await typeThenClickAnotherCell({ fieldName: "reps", label: "Reps", dataType: "number", format: { id: "number" } }, "Band above the knees");
  expect(upsertCell).not.toHaveBeenCalled();
  expect(document.body.textContent ?? "").toMatch(/Reps/);
});
