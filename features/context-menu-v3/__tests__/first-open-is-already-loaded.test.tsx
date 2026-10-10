/**
 * NOTHING BEFORE THE FIRST OPEN. (Replaces the old idle warm-up: a menu is opened on ~1 in 149 page loads.)
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

describe("nothing before the first open", () => {
  it("loads no menu engine at mount or when idle; the first right-click starts the load", async () => {
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
    // Nothing loads during the page's own render, and nothing is scheduled for idle.
    expect(engineLoaded).toBe(0);
    expect(idle.length).toBe(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(engineLoaded).toBe(0);
    // The right-click is the engagement: the engine loads then.
    await act(async () => {
      host
        .querySelector("p")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(engineLoaded).toBe(1);

    act(() => root.unmount());
    host.remove();
  });
});
