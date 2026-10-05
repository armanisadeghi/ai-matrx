/**
 * SEVERAL CHOICES, A WORD THAT IS NONE OF THEM, THEN A CLICK ELSEWHERE (BREAKER-2 B2-04, DATA-V2-BASICS-2;
 * Arman's core feature): the Body Areas cell held "Neck", the person added "Ankle" and clicked another
 * cell. Before: the edit ended without a word and "Neck" alone was saved. Now the click-off commits the
 * draft through the same path as one choice — so "Ankle" is ASKED about, and nothing is saved until
 * the person answers.
 *
 * WHAT IS STOOD IN FOR: the service (the network), and the choice picker, reduced to the one gesture
 * that matters (it hands the cell the draft ["Neck", "Ankle"] and never closes itself).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
const upsertCellAddingChoice = jest.fn();
const readChoiceNudge = jest.fn();

jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: (...args: unknown[]) => upsertCellAddingChoice(...args),
  readChoiceNudge: (...args: unknown[]) => readChoiceNudge(...args),
}));

jest.mock("../components/ChoiceInput", () => ({
  ChoiceInput: ({ onChange }: { onChange: (value: unknown) => void }) => (
    <button type="button" data-test-add-ankle="" onClick={() => onChange(["Neck", "Ankle"])}>
      add Ankle
    </button>
  ),
}));

jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { EditableCell } from "../components/EditableCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-29T16:40:00Z" } });
  upsertCellAddingChoice.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-29T16:40:00Z" } });
  readChoiceNudge.mockReset().mockResolvedValue("ask");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const BODY_AREAS = {
  id: "multi_choice" as const,
  options: { choices: [{ value: "Neck" }, { value: "Shoulder" }, { value: "Knee" }], allowOther: false },
};

function cell(editing: boolean) {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <EditableCell
              tableId="t-visits"
              rowId="r-grace"
              fieldName="body_areas"
              fieldDisplayName="Body Areas"
              dataType="array"
              format={BODY_AREAS}
              value={["Neck"]}
              display={<span>Neck</span>}
              editing={editing}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

it("a click elsewhere asks about the new word instead of dropping it", async () => {
  act(() => root.render(cell(true)));
  const add = container.querySelector("[data-test-add-ankle]") as HTMLButtonElement;
  await act(async () => {
    add.click();
    await Promise.resolve();
  });
  // The grid ends the edit (a click on another cell), the list never closed.
  await act(async () => {
    root.render(cell(false));
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  const ask = document.querySelector("[data-matrx-choice-nudge]");
  expect(ask?.textContent ?? "").toMatch(/Ankle/);
  expect(upsertCell).not.toHaveBeenCalled();
});
