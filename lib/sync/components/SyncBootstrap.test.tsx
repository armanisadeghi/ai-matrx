/** Regression for the global React #418 persisted-state hydration incident. */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const boot = jest.fn(() => Promise.resolve());

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ _sync: { boot } }),
}));

import { SyncBootstrap } from "./SyncBootstrap";

describe("SyncBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    boot.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("boots only after the client tree commits", async () => {
    expect(boot).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<SyncBootstrap />);
    });

    expect(boot).toHaveBeenCalledTimes(1);
  });
});
