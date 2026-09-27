/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). A person filtering /trash by kind opens the picker,
 * types "tab" and presses Enter on "Table (557)". RED before the lane: the items sat outside a
 * CommandList, so cmdk found no items to highlight, and an option was chosen only by a click on an
 * inner div: Enter chose nothing.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SELECT_UNDER_TEST = process.env.SEARCHABLE_SELECT_UNDER_TEST ?? "../SearchableSelect";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SearchableSelect = (require(SELECT_UNDER_TEST) as typeof import("../SearchableSelect")).default;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

it("typing and pressing Enter chooses the highlighted option", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const onChange = jest.fn();
  await act(async () => {
    root.render(
      <SearchableSelect
        options={[
          { value: "note", label: "Note (134)" },
          { value: "table", label: "Table (557)" },
        ]}
        onChange={onChange}
        placeholder="Recent"
      />,
    );
  });
  await act(async () => {
    (container.querySelector('[role="combobox"]') as HTMLButtonElement).click();
  });
  await settle();
  const input = document.querySelector("[cmdk-input]") as HTMLInputElement;
  expect(input).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "tab");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith({ value: "table", label: "Table (557)" });
  await act(async () => root.unmount());
  container.remove();
});
