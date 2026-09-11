import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { SearchBox } from "./SearchBox";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SearchBox compact mobile controls", () => {
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

  it("keeps the compact field and submit control at the 44px mobile floor", () => {
    act(() =>
      root.render(<SearchBox currentQuery="pizza" variant="compact" />),
    );

    const input = container.querySelector("input");
    const submit = container.querySelector('button[type="submit"]');

    expect(input?.className).toContain("h-11");
    expect(input?.className).toContain("sm:h-9");
    expect(submit?.className).toContain("h-11");
    expect(submit?.className).toContain("sm:h-9");
  });

  it("gives the compact icon-only submit control an accessible name", () => {
    act(() =>
      root.render(<SearchBox currentQuery="pizza" variant="compact" />),
    );

    expect(
      container
        .querySelector('button[type="submit"]')
        ?.getAttribute("aria-label"),
    ).toBe("Search the web");
  });

  it("replaces an edited draft when browser history changes the URL query", () => {
    act(() =>
      root.render(<SearchBox currentQuery="first" variant="compact" />),
    );

    const input = container.querySelector("input");
    if (!input) throw new Error("Search input did not render");

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "local edit");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.value).toBe("local edit");

    act(() =>
      root.render(<SearchBox currentQuery="second" variant="compact" />),
    );

    expect(input.value).toBe("second");
  });
});
