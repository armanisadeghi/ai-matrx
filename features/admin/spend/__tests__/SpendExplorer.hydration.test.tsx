/**
 * The explorer chooses a local calendar window and timezone. Those facts only
 * exist in the browser, so its server paint must stay empty until mount; this
 * pins the boundary that prevents React #418 on the billing spend route.
 */
import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { SpendExplorer } from "../SpendExplorer";

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/billing/spend",
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@ai-matrx/design-system", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

jest.mock("../service", () => ({
  fetchSpendBreakdown: jest.fn(),
  viewerTimezone: () => "America/Los_Angeles",
}));

jest.mock("../useSpendExplorerKnobs", () => ({
  useSpendExplorerKnobs: () => ({ thresholds: null, error: null }),
}));

jest.mock("../explorer/DigHerePanel", () => ({ DigHerePanel: () => null }));
jest.mock("../explorer/DimensionTables", () => ({ DimensionTables: () => null }));
jest.mock("../explorer/FilterChips", () => ({ FilterChips: () => null }));
jest.mock("../explorer/ParetoPanel", () => ({ ParetoPanel: () => null }));
jest.mock("../explorer/SeriesBars", () => ({ SeriesBars: () => null }));
jest.mock("../explorer/TopRequestsTable", () => ({ TopRequestsTable: () => null }));
jest.mock("../explorer/TotalsStrip", () => ({ TotalsStrip: () => null }));
jest.mock("../explorer/WindowPicker", () => ({ WindowPicker: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("SpendExplorer hydration boundary", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    container.remove();
    jest.restoreAllMocks();
  });

  it("defers browser-local window text until after a matching empty server paint", async () => {
    const serverPaint = renderToString(<SpendExplorer />);
    expect(serverPaint).toBe("");

    container.innerHTML = serverPaint;
    const recoverable: unknown[] = [];
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root = hydrateRoot(container, <SpendExplorer />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Loading");
  });
});
