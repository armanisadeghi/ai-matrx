/**
 * LANE PROOF-DEFECTS (D2) — A VIEWER SEES THE SAME TICK BOX AS THE OWNER.
 *
 * THE USE CASE. Harbor Dental's Hygiene Recall Schedule has a "Reminder sent" yes/no column.
 * The front-desk lead (owner) sees tick boxes in the Sheet; a colleague it was shared with at
 * View sees the same table. Before this fix the colleague's cells read "False" / "True": the
 * Sheet's read-only path printed the formatter's words, and only an editable cell drew the box.
 * RED against that EditableCell (no checkbox when `editable` is false); GREEN once a two-state
 * value is a disabled checkbox for every seat that cannot change it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditableCell } from "@/features/data-tables/components/EditableCell";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function cell(value: unknown, editable: boolean) {
  act(() => {
    root.render(
      <EditableCell
        tableId="b00bde4d-1adc-4682-88eb-57453aabf014"
        rowId="0f1e2d3c-0000-4000-8000-00000000d002"
        fieldName="reminder_sent"
        fieldDisplayName="Reminder sent"
        dataType="boolean"
        value={value}
        display={<span>{value ? "True" : "False"}</span>}
        editable={editable}
      />,
    );
  });
  return host.querySelector('[role="checkbox"]');
}

test("a viewer's ticked reminder is a ticked, disabled box - never the word True", () => {
  const box = cell(true, false);
  expect(box).not.toBeNull();
  expect(box?.getAttribute("aria-checked")).toBe("true");
  expect(box?.hasAttribute("disabled")).toBe(true);
  expect(host.textContent).not.toContain("True");
});

test("a viewer's unticked reminder is an empty, disabled box - never the word False", () => {
  const box = cell(false, false);
  expect(box?.getAttribute("aria-checked")).toBe("false");
  expect(host.textContent).not.toContain("False");
});

test("the owner still gets a box they can change", () => {
  const box = cell(true, true);
  expect(box?.hasAttribute("disabled")).toBe(false);
});
