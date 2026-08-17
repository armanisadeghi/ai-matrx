/** Regression for the /dashboard server/browser timezone hydration mismatch. */

import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "Ada Lovelace",
}));

import { DashboardGreeting } from "./DashboardGreeting";

describe("DashboardGreeting", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = undefined;
    container.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("hydrates cleanly when the server and browser clocks imply different greetings", async () => {
    jest.setSystemTime(new Date("2026-08-17T20:00:00Z"));
    container.innerHTML = renderToString(<DashboardGreeting />);
    expect(container.textContent).toBe("Welcome back, Ada");

    jest.setSystemTime(new Date("2026-08-17T08:00:00Z"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root = hydrateRoot(container, <DashboardGreeting />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.textContent).toBe("Good morning, Ada");
  });
});
