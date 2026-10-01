/**
 * "OPTIONS COME FROM: A SHARED PICK LIST" IS NEVER A DEAD CONTROL (PB-02, 2026-10-01).
 *
 * On /data/<id> → + Column → Shows as: Choice, choosing "A shared pick list" did nothing: the
 * editor wrote `structuredList: { listId: "" }` and then derived its mode from `listId` being
 * truthy, so the selector snapped back to "A list just for this column" and the pick-list picker
 * never appeared. Choosing it must show the lists, and choosing a list must bind the column.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChoiceOptionsEditor } from "../ChoiceOptionsEditor";
import type { FieldFormatOptions } from "@ai-matrx/design-system/field-formats";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATUS_LIST = "7d1c0a52-0000-4000-8000-0000000000a1";

jest.mock("@/features/user-lists/service", () => ({
  getAccessibleLists: async () => [{ id: "7d1c0a52-0000-4000-8000-0000000000a1", list_name: "Carrier status" }],
}));
jest.mock("@/features/user-lists/hooks/useStructuredListForSelection", () => ({
  useStructuredListForSelection: () => ({ groups: [], items: [], loading: false, error: null, unavailable: false }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
// Radix Select does not open in jsdom; a native select drives the same `onValueChange`.
jest.mock("@/components/ui/select", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const Ctx = React.createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <select value={ctx.value ?? ""} onChange={(e) => ctx.onValueChange?.(e.target.value)}>
          <option value="" />
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  };
});

let host: HTMLDivElement;
let root: Root;
let latest: FieldFormatOptions = {};
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Harness() {
  const React = jest.requireActual("react") as typeof import("react");
  const [options, setOptions] = React.useState<FieldFormatOptions>({ choices: [] });
  latest = options;
  return <ChoiceOptionsEditor options={options} onChange={setOptions} />;
}

const selects = () => Array.from(host.querySelectorAll("select"));
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("choosing 'A shared pick list' keeps that choice and offers the lists", async () => {
  await act(async () => root.render(<Harness />));
  await choose(selects()[0]!, "list");
  expect(selects()[0]!.value).toBe("list");
  expect(host.textContent).toContain("Pick list");
  await act(async () => {});
  expect(host.textContent).toContain("Carrier status");
});

test("choosing a list binds the column to it", async () => {
  await act(async () => root.render(<Harness />));
  await choose(selects()[0]!, "list");
  await act(async () => {});
  await choose(selects()[1]!, STATUS_LIST);
  expect(latest.structuredList?.listId).toBe(STATUS_LIST);
});

test("going back to 'A list just for this column' drops the binding", async () => {
  await act(async () => root.render(<Harness />));
  await choose(selects()[0]!, "list");
  await choose(selects()[0]!, "inline");
  expect(selects()[0]!.value).toBe("inline");
  expect(latest.structuredList).toBeUndefined();
});
