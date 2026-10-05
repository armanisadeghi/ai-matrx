/**
 * A CHOICE COLUMN'S DEFAULT THAT IS NONE OF ITS CHOICES IS ASKED (BREAKER-3 B3-14, BREAKER-2 B2-14).
 *
 * The use case: a physical-therapy front desk adds a "Priority" choice column (Routine, Urgent,
 * Elective) and mistypes the default as "Rutine". The column takes other values, so nothing refused
 * it and every new visit was stamped "Rutine". Now the dialog asks before anything is sent — the same
 * three answers a cell gets: Add (it becomes a choice), Keep as typed, Cancel (the default is cleared).
 *
 * WHAT IS STOOD IN FOR: the service (the network) and the look picker, reduced to the one gesture
 * that matters (it hands the dialog a Choice look with three choices).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockCalls = { add: [] as unknown[], format: [] as unknown[] };

jest.mock("@/features/data-tables/service", () => ({
  addTableColumn: async (args: unknown) => {
    mockCalls.add.push(args);
    return { success: true, columnId: "f-priority" };
  },
  setFieldFormat: async (args: unknown) => {
    mockCalls.format.push(args);
    return { ok: true };
  },
}));
jest.mock("@/features/data-tables/hooks/useRelationTargets", () => ({ useRelationTargets: () => undefined }));
jest.mock("@/lib/field-formats/FieldFormatPicker", () => ({
  FieldFormatPicker: ({ onChange }: { onChange: (f: unknown) => void }) => (
    <button
      type="button"
      data-test-choice-look=""
      onClick={() => onChange({ id: "choice", options: { choices: [{ value: "Routine" }, { value: "Urgent" }, { value: "Elective" }] } })}
    >
      Shows as Choice
    </button>
  ),
}));

import AddColumnModal from "../AddColumnModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; the dialog's switch measures itself with one.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
const byText = (tag: string, text: string) =>
  [...document.body.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text) ?? null;
const nudgeButton = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("[data-matrx-choice-nudge] button")].find((b) => b.textContent?.trim() === label)!;

function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function open() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AddColumnModal tableId="t-visits" organizationId="o-clinic" isOpen onClose={() => {}} onSuccess={() => {}} />);
  });
  await act(async () => type(q<HTMLInputElement>("#displayName")!, "Priority"));
  await act(async () => q<HTMLButtonElement>("[data-test-choice-look]")!.click());
  await act(async () => type(q<HTMLInputElement>("#defaultValue")!, "Rutine"));
}

async function submit() {
  await act(async () => {
    q<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  mockCalls.add.length = 0;
  mockCalls.format.length = 0;
});

describe("Add Column · a choice default that is none of the choices", () => {
  it("asks before the column is sent, and sends nothing until it is answered", async () => {
    await open();
    expect(document.body.textContent).toContain('Add "Rutine" to the choices for Priority?');
    await submit();
    expect(mockCalls.add).toHaveLength(0);
  });

  it("Add makes it a choice, then the column is made with it as the default", async () => {
    await open();
    await act(async () => nudgeButton("Add").click());
    await submit();
    expect(mockCalls.add).toHaveLength(1);
    expect((mockCalls.add[0] as { defaultValue: unknown }).defaultValue).toBe("Rutine");
    const sent = (mockCalls.format[0] as { format: { options?: { choices?: Array<{ value: string }> } } }).format;
    expect((sent.options?.choices ?? []).map((c) => c.value)).toEqual(["Routine", "Urgent", "Elective", "Rutine"]);
  });

  it("Keep as typed sends it as it is", async () => {
    await open();
    await act(async () => nudgeButton("Keep as typed").click());
    await submit();
    expect(mockCalls.add).toHaveLength(1);
    expect((mockCalls.add[0] as { defaultValue: unknown }).defaultValue).toBe("Rutine");
  });

  it("Cancel clears the default and asks nothing more", async () => {
    await open();
    await act(async () => nudgeButton("Cancel").click());
    expect(q<HTMLInputElement>("#defaultValue")!.value).toBe("");
    expect(q("[data-matrx-choice-nudge]")).toBeNull();
    expect(byText("p", 'Add "Rutine" to the choices for Priority?')).toBeNull();
  });
});
