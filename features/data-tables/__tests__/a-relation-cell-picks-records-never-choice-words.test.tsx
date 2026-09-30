/**
 * A RELATION CELL IN THE SHEET PICKS RECORDS, NEVER CHOICE WORDS (BREAKER-3 B3-01, S2).
 *
 * The use case: a physical-therapy clinic's "Referral Intake Log" has a Relation column "Follow-up
 * Task" pointing at its "Front Desk Follow-ups" table. MEASURED on production: in the Sheet the cell
 * opened a choice list ("No options declared yet. Type a value to use one.") and typing "Call Sean"
 * asked 'Add "Call Sean" to the choices for Follow-up Task?'. The Grid had the right picker.
 *
 * Now: the cell draws records-ui's own control (`FieldControl`, which routes a relation to the one
 * RelationPicker) with the column as a store Field, and no "is this word a choice?" question is ever
 * asked of a Relation column.
 * WHAT IS STOOD IN FOR: the network, and records-ui's control, reduced to a marker that shows the
 * Field it was handed and makes one pick.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: jest.fn(),
  readChoiceNudge: jest.fn(async () => "ask"),
  isRecordStoreTable: () => true,
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
jest.mock("@ai-matrx/records-ui", () => ({
  RefusalNotice: () => null,
  FieldControl: ({ field, onChange }: { field: { type: string; relation_target: string; label: string }; onChange: (v: unknown) => void }) => (
    <button
      type="button"
      data-test-records-picker={`${field.type}:${field.relation_target}:${field.label}`}
      onClick={() => onChange("5a3c2f10-1b2c-4d5e-8f90-0a1b2c3d4e5f")}
    >
      Pick
    </button>
  ),
}));

import { EditableCell } from "../components/EditableCell";
import { decideTypedChoice } from "../choice-option-nudge";
import { offListChoiceWords } from "../cell-word";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const FOLLOW_UP = {
  id: "relation" as const,
  options: { relation_target: "6bf21987-9693-4e89-9fe7-7802e1e8866a", relation_max: 1 },
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-30T03:00:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

test("the Sheet's Relation cell opens the records picker for its target table, and one pick saves the record", async () => {
  const onEndEdit = jest.fn();
  await act(async () => {
    root.render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell
                tableId="c17efad3-2d0e-42f6-8565-34f62854dfa9"
                rowId="00ef4e1c-52ff-4ce4-ba6f-6939736216c0"
                fieldId="f0a1b2c3-0000-4000-8000-00000000f011"
                fieldName="follow_up_task"
                fieldDisplayName="Follow-up Task"
                dataType="string"
                format={FOLLOW_UP}
                value={null}
                display={<span>—</span>}
                editing
                onEndEdit={onEndEdit}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
  });
  const picker = document.querySelector<HTMLButtonElement>("[data-test-records-picker]");
  expect(picker?.dataset.testRecordsPicker).toBe("relation:6bf21987-9693-4e89-9fe7-7802e1e8866a:Follow-up Task");
  expect(document.body.textContent).not.toContain("No options declared yet");
  await act(async () => picker!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(upsertCell).toHaveBeenCalledTimes(1);
  expect(upsertCell.mock.calls[0][0]).toMatchObject({ fieldName: "follow_up_task", value: "5a3c2f10-1b2c-4d5e-8f90-0a1b2c3d4e5f" });
  expect(document.body.textContent).not.toContain("to the choices for");
});

test("typed words are never asked about as choices on a Relation column (nor a Person column)", () => {
  expect(decideTypedChoice(FOLLOW_UP, "Call Sean", "ask")).toEqual({ kind: "none" });
  expect(offListChoiceWords("Call Sean", { display_name: "Follow-up Task", data_type: "string", metadata: { format: FOLLOW_UP } })).toEqual([]);
  expect(decideTypedChoice({ id: "choice", options: { choices: [{ value: "Urgent" }] } }, "Rutine", "ask")).toMatchObject({ kind: "ask", words: ["Rutine"] });
});
