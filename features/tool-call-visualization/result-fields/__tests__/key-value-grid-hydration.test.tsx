import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { KeyValueGrid, formatMetaNumber } from "../KeyValueGrid";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("KeyValueGrid hydration", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = undefined;
    container.remove();
    jest.restoreAllMocks();
  });

  it("formats metadata with the fixed server/browser locale", () => {
    expect(formatMetaNumber(1_234)).toBe("1,234");
    expect(formatMetaNumber(12_345)).toBe("12.3K");
  });

  it("hydrates numeric metadata without recoverable text mismatches", async () => {
    const value = { row_count: 1_234, total_chars: 12_345 };
    container.innerHTML = renderToString(<KeyValueGrid value={value} />);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root = hydrateRoot(container, <KeyValueGrid value={value} />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1,234");
    expect(container.textContent).toContain("12.3K");
  });
});
