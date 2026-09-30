/**
 * AN EDIT MADE OFFLINE IS KEPT AND SENT AGAIN (BREAKER-3 B3-24, BREAKER-2 B2-32).
 *
 * The use case: at Cedar Ridge Physical Therapy the front desk edits a visit's Notes cell as the
 * clinic's wifi drops. MEASURED on production: "We could not reach your data. Nothing was changed.
 * Check your connection and open this again." over the next rows, the typed text gone, and nothing
 * retried when the connection came back. Now the cell keeps the typed words on its notice, sends
 * them again when the browser is back online, and offers Try now and Discard.
 * WHAT IS STOOD IN FOR: the network (the service's upsertCell).
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
// The long-text editor, reduced to its textarea (the real one needs the app's Redux store).
jest.mock("@/components/official/ProTextarea", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const ProTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) =>
    React.createElement("textarea", { ...props, ref }),
  );
  return { ProTextarea };
});

import { EditableCell } from "../components/EditableCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const OFFLINE = { success: false, error: "We could not reach your data.", refusal: { code: "unreachable", message: "We could not reach your data." } };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  upsertCell.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function cell(editing: boolean) {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <EditableCell
              tableId="c17efad3-2d0e-42f6-8565-34f62854dfa9"
              rowId="00ef4e1c-52ff-4ce4-ba6f-6939736216c0"
              fieldName="notes"
              fieldDisplayName="Notes"
              dataType="string"
              value="Ice after session"
              display={<span>Ice after session</span>}
              editing={editing}
              onEndEdit={() => {}}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("offline, the typed words are kept on the cell; back online they are saved", async () => {
  upsertCell.mockResolvedValueOnce(OFFLINE).mockResolvedValueOnce({ success: true, data: { updated_at: "2026-09-30T04:00:00Z" } });
  await act(async () => root.render(cell(true)));
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")!;
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, "Ice after session; heat at home");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  await flush();
  await act(async () => root.render(cell(false)));
  await flush();

  const notice = document.body.querySelector("[data-matrx-cell-unsent]");
  expect(notice?.textContent ?? "").toContain("Not saved yet");
  expect(notice?.textContent ?? "").toContain("Ice after session; heat at home");
  expect(document.body.textContent).not.toContain("open this again");

  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await flush();
  expect(upsertCell).toHaveBeenCalledTimes(2);
  expect(upsertCell.mock.calls[1][0]).toMatchObject({ fieldName: "notes", value: "Ice after session; heat at home" });
  expect(document.body.querySelector("[data-matrx-cell-unsent]")).toBeNull();
});
