/**
 * THE SHEET'S COLUMN EDITOR ASKS BEFORE IT REMOVES A CHOICE RECORDS HOLD (lane CHOICE-TAILS).
 *
 * Harbor Dental's "Visit Type": Cleaning (3 visits) · Exam (none) · X-ray (2 visits). Removing X-ray
 * asks, Notion-style: "2 records use “X-ray”." — Move them to [another choice], Keep the words as
 * other values (only when the column allows other values), or Clear them. Removing Exam, which no
 * visit holds, asks nothing. RED on HEAD: the trash button removed X-ray at once.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChoiceOptionsEditor } from "../ChoiceOptionsEditor";
import type { FieldFormatOptions } from "@ai-matrx/design-system/field-formats";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/user-lists/service", () => ({ getAccessibleLists: async () => [] }));
jest.mock("@/features/user-lists/hooks/useStructuredListForSelection", () => ({
  useStructuredListForSelection: () => ({ groups: [], items: [], loading: false, error: null, unavailable: false }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const CLEAN = "0b5e7c1a-0000-4000-8000-00000000d001";
const EXAM = "0b5e7c1a-0000-4000-8000-00000000d002";
const XRAY = "0b5e7c1a-0000-4000-8000-00000000d003";
const USAGE = {
  [CLEAN]: { key: "cleaning", words: "Cleaning", retired: false, records: 3 },
  [EXAM]: { key: "exam", words: "Exam", retired: false, records: 0 },
  [XRAY]: { key: "x_ray", words: "X-ray", retired: false, records: 2 },
};

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

function Harness({ allowOther, onRehome }: { allowOther: boolean; onRehome: (r: Record<string, unknown>) => void }) {
  const React = jest.requireActual("react") as typeof import("react");
  const [options, setOptions] = React.useState<FieldFormatOptions>({
    choices: [{ value: "Cleaning", id: CLEAN }, { value: "Exam", id: EXAM }, { value: "X-ray", id: XRAY }] as never,
    allowOther,
  });
  const [rehome, setRehome] = React.useState<Record<string, never>>({});
  return (
    <ChoiceOptionsEditor
      options={options}
      onChange={setOptions}
      usage={USAGE}
      rehome={rehome}
      onRehomeChange={(next) => {
        setRehome(next as never);
        onRehome(next);
      }}
    />
  );
}

function mount(allowOther: boolean, onRehome: (r: Record<string, unknown>) => void = () => undefined) {
  act(() => root.render(<Harness allowOther={allowOther} onRehome={onRehome} />));
}
const button = (name: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === name || (b.textContent ?? "").trim() === name) ?? null;
const values = () => Array.from(host.querySelectorAll('input[aria-label="Option value"]')).map((i) => (i as HTMLInputElement).value);
const click = (el: Element | null) => act(() => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

test("removing X-ray asks where its 2 records go, and X-ray stays until answered", () => {
  mount(false);
  click(button("Remove X-ray"));
  expect(host.textContent).toContain("2 records use “X-ray”.");
  expect(button("Move them to")).not.toBeNull();
  expect(button("Clear them")).not.toBeNull();
  expect(button("Keep the words as other values")).toBeNull();
  expect(values()).toEqual(["Cleaning", "Exam", "X-ray"]);
  click(button("Cancel"));
  expect(host.textContent).not.toContain("2 records use “X-ray”.");
  expect(values()).toEqual(["Cleaning", "Exam", "X-ray"]);
});

test("Keep the words is offered only when the column allows other values", () => {
  mount(true);
  click(button("Remove X-ray"));
  expect(button("Keep the words as other values")).not.toBeNull();
});

test("Clear them removes X-ray, records the answer, says what Save will do, and can be put back", () => {
  const seen: Array<Record<string, unknown>> = [];
  mount(false, (r) => seen.push(r));
  click(button("Remove X-ray"));
  click(button("Clear them"));
  expect(values()).toEqual(["Cleaning", "Exam"]);
  expect(seen.at(-1)).toEqual({ [XRAY]: { then: "clear" } });
  expect(host.textContent).toContain("2 records that hold “X-ray” are cleared.");
  click(button("Put it back"));
  expect(values()).toEqual(["Cleaning", "Exam", "X-ray"]);
  expect(seen.at(-1)).toEqual({});
});

test("removing Exam, which no record holds, asks nothing", () => {
  mount(false);
  click(button("Remove Exam"));
  expect(host.textContent).not.toMatch(/records? uses? “Exam”/);
  expect(values()).toEqual(["Cleaning", "X-ray"]);
});
