/**
 * A CELL OPENED BY TYPING KEEPS EVERY KEY (Arman, 2026-09-28, on the /data grid).
 *
 * "For certain data types, such as date time, the first character you type is ignored! So if I
 * type 1200PM, I get 2:00PM because the one isn't recorded." Measured on the older /data grid
 * (UserTableViewer), key by key, as admin@admin.com: a Time cell typed `1200PM` stored "14:00"
 * (the native time control could not hold the "1" and took "200PM" segment by segment); a Date
 * cell typed `10/03/2026` held "0/03/2026" (the editor mounted holding "1" and selected it, so
 * the "0" replaced it); a Number cell typed `-150` stored 150 (a number control drops a lone "-").
 *
 * The cell now opens a plain text box holding exactly what was typed, the caret AFTER it, and the
 * words are read once on Enter by the one reader every grid uses (`@ai-matrx/records`).
 * THE REAL EditableCell / DateCellEditor are rendered; only the network is stood in for.
 * RED on the HEAD bytes: time wrote "14:00"-shaped text via a type="time" box, the date box held
 * its "1" selected, the number box was type="number".
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
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-28T17:00:00Z" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function open(props: { fieldName: string; label: string; dataType: FieldDataType; format?: { id: string } | null; seed: string }) {
  await act(async () => {
    root.render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell
                tableId="7a67d78f-6f5f-47d9-afe6-b0a80e4621ba"
                rowId="514b2acd-3cf7-42f2-b235-cf212c8f044a"
                fieldName={props.fieldName}
                fieldDisplayName={props.label}
                dataType={props.dataType}
                format={(props.format ?? null) as never}
                value={null}
                display={<span>—</span>}
                editing
                seed={props.seed}
                onEndEdit={jest.fn()}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    await Promise.resolve();
  });
  const box = container.querySelector("input") as HTMLInputElement | null;
  expect(box).not.toBeNull();
  return box!;
}

async function typeRest(box: HTMLInputElement, whole: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, whole);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function enter(box: HTMLInputElement) {
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const written = () => upsertCell.mock.calls.map((c) => (c[0] as { value: unknown }).value);

test("a Time cell typed 1200PM holds every key in a text box and stores 12:00", async () => {
  const box = await open({ fieldName: "arrival_time", label: "Arrival Time", dataType: "string", format: { id: "time" }, seed: "1" });
  expect(box.type).toBe("text");
  expect(box.value).toBe("1");
  expect([box.selectionStart, box.selectionEnd]).toEqual([1, 1]);
  await typeRest(box, "1200PM");
  await enter(box);
  expect(written()).toEqual(["12:00"]);
});

test("a Time cell typed a bare 9 is refused with the way to write it, and nothing is written", async () => {
  const box = await open({ fieldName: "arrival_time", label: "Arrival Time", dataType: "string", format: { id: "time" }, seed: "9" });
  await enter(box);
  expect(upsertCell).not.toHaveBeenCalled();
  expect(document.body.textContent).toMatch(/2:30 PM/);
  expect(box.value).toBe("9");
});

test("a Number cell typed -150 keeps its minus", async () => {
  const box = await open({ fieldName: "quote", label: "Quote", dataType: "number", seed: "-" });
  expect(box.type).toBe("text");
  expect(box.value).toBe("-");
  await typeRest(box, "-150");
  await enter(box);
  expect(written()).toEqual([-150]);
});

test("a Date cell typed 10/03/2026 keeps its first key — the typed 1 is never selected", async () => {
  const box = await open({ fieldName: "service_date", label: "Service Date", dataType: "date", seed: "1" });
  expect(box.value).toBe("1");
  expect([box.selectionStart, box.selectionEnd]).toEqual([1, 1]);
  await typeRest(box, "10/03/2026");
  await enter(box);
  expect(written()).toEqual(["2026-10-03"]);
});

test("a Date & time cell typed 10/03/2026 1200PM stores noon on that day", async () => {
  const box = await open({ fieldName: "appointment", label: "Appointment", dataType: "datetime", seed: "1" });
  expect([box.selectionStart, box.selectionEnd]).toEqual([1, 1]);
  await typeRest(box, "10/03/2026 1200PM");
  await enter(box);
  expect(written()).toEqual(["2026-10-03T12:00"]);
});
