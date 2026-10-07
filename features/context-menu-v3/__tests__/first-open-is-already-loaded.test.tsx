/**
 * The first right-click after a page load draws at once.
 *
 * THE DEFECT (G11A review, 2026-10-07): the menu engine is one lazy chunk that
 * was fetched only ON the first right-click, so the first open after a page
 * load took 1–2 s. The shell now warms that same chunk once, when the browser
 * is idle after the first menu mounts — the menu itself still renders only on
 * open (code-splitting rule 3: no new boundary).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let engineLoaded = 0;
jest.mock("../components/AlchemyMenuContent", () => {
  engineLoaded += 1;
  return { __esModule: true, default: () => null };
});
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

import { NonEditableContextMenu } from "../NonEditableContextMenu";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("the first right-click", () => {
  it("finds the menu engine already loaded: it is warmed when the page goes idle", async () => {
    const idle: IdleRequestCallback[] = [];
    window.requestIdleCallback = (cb: IdleRequestCallback) => idle.push(cb);
    window.cancelIdleCallback = () => undefined;

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <NonEditableContextMenu sourceFeature="system">
          <p>words</p>
        </NonEditableContextMenu>,
      );
    });
    // Nothing loads during the page's own render…
    expect(engineLoaded).toBe(0);
    expect(idle.length).toBeGreaterThan(0);
    // …and once the browser is idle, the engine is in hand before any open.
    await act(async () => {
      for (const cb of idle) cb({ didTimeout: false, timeRemaining: () => 50 });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(engineLoaded).toBe(1);

    act(() => root.unmount());
    host.remove();
  });
});
