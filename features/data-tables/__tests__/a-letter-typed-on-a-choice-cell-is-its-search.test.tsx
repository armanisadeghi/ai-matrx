/**
 * A LETTER TYPED ON A CHOICE CELL IS ITS LIST'S SEARCH, NEVER ITS VALUE (lane DATA-V2-BASICS).
 *
 * Measured on /data-v2 (the Sheet, production, 2026-09-27): selecting a Status cell ("In Progress")
 * and typing "Waiting on parts" put "W" on the picker's trigger — as the cell's VALUE — and
 * "aiting on parts" in its search box. Pressing Escape then SAVED "W" to the record (read back from
 * the store), and Cmd-Z could not take it back. Sheets and Airtable: typing on a choice cell opens
 * its list with the letters as the search; Escape changes nothing.
 *
 * THE REAL PICKER (ChoiceInput) is rendered; only the network is stood in for.
 * RED on the HEAD bytes: the search box read "" and the trigger read "W"; Escape saved "W".
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

import { EditableCell } from "../components/EditableCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the picker's popper and cmdk's list only need these to exist.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-27T17:00:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const STATUS = {
  id: "choice" as const,
  options: {
    choices: [{ value: "Scheduled" }, { value: "In Progress" }, { value: "Completed" }, { value: "Invoiced" }],
    allowOther: true,
  },
};

test('typing "W" on a Status cell searches the list for W; the value stays "In Progress"', async () => {
  const onEndEdit = jest.fn();
  await act(async () => {
    root.render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell
                tableId="3260bbbe-aaa8-4148-a4d9-7ad880e7976d"
                rowId="00ef4e1c-52ff-4ce4-ba6f-6939736216c0"
                fieldName="status"
                fieldDisplayName="Status"
                dataType="string"
                format={STATUS}
                value="In Progress"
                display={<span>In Progress</span>}
                editing
                seed="W"
                onEndEdit={onEndEdit}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    await Promise.resolve();
  });
  const search = document.querySelector("[cmdk-input]") as HTMLInputElement | null;
  expect(search).not.toBeNull();
  expect(search!.value).toBe("W");
  const trigger = container.querySelector('[role="combobox"]');
  expect(trigger?.textContent).toContain("In Progress");
  expect(trigger?.textContent).not.toBe("W");

  // Escape closes the list and changes nothing.
  await act(async () => {
    search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(upsertCell).not.toHaveBeenCalled();
});
