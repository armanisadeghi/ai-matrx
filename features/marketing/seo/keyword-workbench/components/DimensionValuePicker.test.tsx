import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DimensionValuePicker } from "./DimensionValuePicker";

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

describe("DimensionValuePicker", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("opens an editable dimension form when Add is chosen without typed text", () => {
    act(() => {
      root.render(
        <DimensionValuePicker
          siteId="site-1"
          dimensions={[]}
          picked={null}
          onPicked={jest.fn()}
        />,
      );
    });

    const dimension = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Dimension"]',
    );
    expect(dimension).not.toBeNull();
    act(() => dimension!.click());

    const add = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Add a dimension…",
    );
    expect(add).toBeDefined();
    act(() => add!.click());

    for (const name of ["Dimension name", "First choice", "Second choice"]) {
      const input = document.querySelector<HTMLInputElement>(
        `input[aria-label="${name}"]`,
      );
      expect(input).not.toBeNull();
      expect(input!.disabled).toBe(false);
    }
  });
});
