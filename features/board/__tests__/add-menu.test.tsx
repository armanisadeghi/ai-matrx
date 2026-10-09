/**
 * The Add menu: sections, a search box that filters across them, Enter adds, Recent remembers.
 * Rendered with the real catalog rows (not the real tile bodies).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { FileText, Table2 } from "lucide-react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
Element.prototype.scrollIntoView = () => {};

import { AddMenu } from "../home/AddMenu";
import type { BoardItemType } from "../items/types";

const fake = (key: string, label: string, section: BoardItemType["section"], icon = FileText): BoardItemType =>
  ({
    key,
    label,
    icon,
    section,
    startNew: { label: `New ${label.toLowerCase()}`, create: () => ({ title: label, source: { kind: "label", text: label } }) },
    bringIn: { label: `Existing ${label.toLowerCase()}`, Picker: () => null },
  }) as unknown as BoardItemType;

const types = [fake("note", "Note", "notes"), fake("data-table", "Table", "data", Table2), fake("chat", "Chat", "ai")];

async function open(onStartNew = jest.fn(), onBringIn = jest.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<AddMenu types={types} onStartNew={onStartNew} onBringIn={onBringIn} />));
  await act(async () => {
    (host.querySelector("button") as HTMLButtonElement).click();
  });
  return { onStartNew, onBringIn, unmount: () => act(() => root.unmount()) };
}
const labels = () => Array.from(document.querySelectorAll("[cmdk-item]")).map((e) => e.textContent);
const headings = () => Array.from(document.querySelectorAll("[cmdk-group-heading]")).map((e) => e.textContent);

async function type(value: string) {
  const input = document.querySelector("[cmdk-input]") as HTMLInputElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Add menu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("lists rows under their section names, canvas tools first", async () => {
    const m = await open();
    expect(headings()).toEqual(["Canvas", "Notes & docs", "Data", "AI"]);
    expect(labels()).toEqual(expect.arrayContaining(["Sticky note", "New note", "New table", "New chat"]));
    await m.unmount();
  });

  it("typing filters across sections and Enter adds the first match", async () => {
    const m = await open();
    await type("tab");
    expect(labels().map((l) => l?.replace(/Data|Existing.*/g, ""))).toEqual(["New table"]);
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(m.onStartNew).toHaveBeenCalledTimes(1);
    expect(m.onStartNew.mock.calls[0][0].key).toBe("data-table");
    await m.unmount();
  });

  it("the row's second door brings in", async () => {
    const m = await open();
    await act(async () => {
      (document.querySelector('button[aria-label="Bring in: Existing note"]') as HTMLButtonElement).click();
    });
    expect(m.onBringIn).toHaveBeenCalledTimes(1);
    expect(m.onStartNew).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("nothing matching says so", async () => {
    const m = await open();
    await type("zzzz");
    expect(document.querySelector("[cmdk-empty]")).not.toBeNull();
    await m.unmount();
  });
});
