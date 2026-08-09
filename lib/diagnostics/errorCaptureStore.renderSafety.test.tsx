/**
 * @jest-environment jsdom
 *
 * Render-safety contract for the error capture store (FOUND_DEFECTS D61/D76).
 *
 * `captureError` is called from render-path recovery code (content-ir compile
 * failures, route/envelope screams, data-shape reads). If the store notified
 * its `useSyncExternalStore` subscribers SYNCHRONOUSLY, every such capture
 * would re-render the Error Inspector badge inside the erroring component's
 * render pass — React's "Cannot update a component while rendering a
 * different component" warning, seen at mount on /, /scraper and during
 * /chat streams. The store therefore defers listener notification to a
 * microtask; these tests pin that contract:
 *
 *  1. A component calling `captureError` during its own render produces NO
 *     React update-during-render warning.
 *  2. Subscribers still converge — the capture becomes visible to a
 *     `useSyncExternalStore` subscriber once the stack unwinds.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { captureError, clearCapturedErrors } from "./errorCaptureStore";
import { useCapturedErrorStats } from "./useCapturedErrors";

function Badge(): React.JSX.Element {
  const stats = useCapturedErrorStats();
  return <span data-testid="badge">{stats.total}</span>;
}

let fired = false;
function ScreamsDuringRender(): React.JSX.Element {
  if (!fired) {
    fired = true;
    captureError({
      source: "content-ir",
      message: "render-time scream (render-safety test)",
    });
  }
  return <span>screamer</span>;
}

describe("errorCaptureStore render safety", () => {
  let container: HTMLDivElement;
  let root: Root;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    clearCapturedErrors();
    fired = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    errorSpy.mockRestore();
    clearCapturedErrors();
    // Drain the store's deferred notify so it never fires into the next test.
    await act(async () => {});
  });

  it("captureError during another component's render does not trigger React's update-during-render warning", async () => {
    // Mount the badge alone first — `useSyncExternalStore` subscribes at
    // COMMIT, so the store must have a live React subscriber (the real-world
    // shell badge) before the screaming component renders.
    await act(async () => {
      root.render(<Badge />);
    });

    await act(async () => {
      root.render(
        <>
          <Badge />
          <ScreamsDuringRender />
        </>,
      );
    });

    const reactWarnings = errorSpy.mock.calls
      .map((args) => args.map(String).join(" "))
      .filter(
        (msg) =>
          msg.includes("Cannot update a component") ||
          msg.includes("hasn't mounted yet"),
      );
    expect(reactWarnings).toEqual([]);
  });

  it("subscribers still see the capture once the stack unwinds", async () => {
    await act(async () => {
      root.render(<Badge />);
    });
    await act(async () => {
      root.render(
        <>
          <Badge />
          <ScreamsDuringRender />
        </>,
      );
    });
    // act() drained the microtask queue — the deferred notify has landed.
    const badge = container.querySelector('[data-testid="badge"]');
    expect(badge?.textContent).toBe("1");
  });
});
