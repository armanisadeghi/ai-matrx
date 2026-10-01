/**
 * A CLICK THAT SELECTS A PHONE CELL NEVER CALLS (BREAKER-3 B3-22, still seen by BREAKER-4).
 *
 * The use case: the front desk clicks a patient's Phone cell to select it (to copy it, or to type a new
 * number). MEASURED on production: the page asked for `tel:7145550119` — the selecting click also
 * started a call. Now the first click selects; on a selected cell a click on the number calls.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../service", () => ({
  upsertCell: jest.fn(),
  upsertCellAddingChoice: jest.fn(),
  readChoiceNudge: jest.fn(async () => "ask"),
  isRecordStoreTable: () => true,
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { EditableCell } from "../components/EditableCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function phone(selected: boolean) {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <EditableCell
              tableId="43a4e987-0ff2-4310-a445-ec55399035e8"
              rowId="00ef4e1c-52ff-4ce4-ba6f-6939736216c0"
              fieldName="phone"
              fieldDisplayName="Phone"
              dataType="string"
              format={{ id: "phone" }}
              value="(714) 555-0119"
              display={<a href="tel:7145550119">(714) 555-0119</a>}
              selected={selected}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function clickLink(): boolean {
  const link = container.querySelector("a[href^='tel:']")!;
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    link.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

test("on a cell that is not selected, the click selects and the call does not start", () => {
  act(() => root.render(phone(false)));
  expect(clickLink()).toBe(true);
});

test("on a selected cell, a click on the number calls", () => {
  act(() => root.render(phone(true)));
  expect(clickLink()).toBe(false);
});
