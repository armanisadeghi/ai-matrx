/**
 * A window opened from INSIDE a windowed Dialog's React tree stays in front of
 * that Dialog when the person uses it.
 *
 * THE DEFECT (live 2026-10-02, "Add a reference" → File → Browse files). The
 * reference picker is a windowed (non-blocking) Dialog at z 10000; its
 * "Browse files" renders the file picker `WindowPanel` as a child, portaled to
 * <body> at the window manager's z (1000). The window announced itself front
 * on mount and the Dialog stepped behind (z 999) — then the window's own
 * search box took focus. React bubbles a portaled child's synthetic events to
 * its React ancestors, so that focus reached the Dialog's `onFocusCapture`,
 * which brought the Dialog back to z 10000, over the window. To the person,
 * the button did nothing.
 *
 * The class: ANY window rendered from inside a windowed Dialog (every nested
 * picker). The fix: a press or focus inside a window re-claims the front, and
 * its capture handler runs after the Dialog's. This guard runs the REAL
 * `WindowPanel` inside the REAL package `Dialog`.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import windowManagerReducer from "@/lib/redux/slices/windowManagerSlice";
import adminDebugReducer from "@/lib/redux/preferences/adminDebugSlice";
import urlSyncReducer from "@/lib/redux/slices/urlSyncSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

jest.mock("@/features/window-panels/utils/lazy-bundle-guard", () => ({
  assertLazyLoaded: () => undefined,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function zOf(el: Element): number {
  const inline = (el as HTMLElement).style.zIndex;
  if (inline) return Number(inline);
  // The LAST z utility wins (cn/tailwind-merge keeps one, but be explicit).
  const all = [...el.className.matchAll(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?=\s|$)/g)];
  const last = all[all.length - 1];
  return last ? Number(last[1] ?? last[2]) : 0;
}

describe("a WindowPanel opened from inside a windowed Dialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    Element.prototype.scrollIntoView = jest.fn();
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.releasePointerCapture = jest.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it("stays above the Dialog when its own field takes focus", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });

    function Harness({ withWindow }: { withWindow: boolean }) {
      return (
        <Provider store={store}>
          <Dialog open onOpenChange={() => undefined}>
            <DialogContent>
              <DialogTitle>Add a reference</DialogTitle>
              <button type="button">Browse files</button>
              {withWindow ? (
                <WindowPanel
                  id="file-picker-from-a-dialog"
                  title="Choose a file"
                  onClose={() => undefined}
                >
                  <input aria-label="Search files" />
                </WindowPanel>
              ) : null}
            </DialogContent>
          </Dialog>
        </Provider>
      );
    }

    await act(async () => {
      root.render(<Harness withWindow={false} />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await act(async () => {
      root.render(<Harness withWindow />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]')!;
    const windowEl = document.querySelector(
      '[data-window-id="file-picker-from-a-dialog"]',
    )!;
    expect(dialog).not.toBeNull();
    expect(windowEl).not.toBeNull();
    // The window is portaled OUT of the dialog's DOM (to <body>) …
    expect(dialog.contains(windowEl)).toBe(false);

    // … and its search box takes focus (the file picker autofocuses it). No
    // press: a press also raises the window in the manager, which re-announces
    // it and would hide the defect.
    const search = windowEl.querySelector("input")!;
    await act(async () => {
      search.focus();
      await Promise.resolve();
    });
    expect(zOf(windowEl)).toBeGreaterThan(zOf(dialog));

    // A press inside the window keeps it in front too.
    await act(async () => {
      search.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await Promise.resolve();
    });
    expect(zOf(windowEl)).toBeGreaterThan(zOf(dialog));
  });
});
