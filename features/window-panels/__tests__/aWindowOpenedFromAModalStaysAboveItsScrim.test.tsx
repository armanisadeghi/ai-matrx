/**
 * A window opened from inside a modal paints above that modal's scrim, and
 * pressing it never closes the modal.
 *
 * THE DEFECT (2026-09-26, the Source screen). The side Drawer holding chunks,
 * entities and attachments hosted the association picker, which opens as a
 * `WindowPanel` portaled to <body> at the window manager's z (1000+). The
 * Drawer's scrim sat at z-10000, so the click that picked an option landed on
 * the scrim and closed the Drawer. Census: the same shape sat in the SEO
 * topical map's Associations sheet and the rich-document Link-record sheet.
 *
 * The fix is the class, in the design system: every blocking surface
 * registers while open, and a floating layer wrapped in `<FloatingLayer>` and
 * painting at `useFloatingLayerZIndex` is lifted to the modal tier (equal z,
 * later in the DOM). This guard runs the REAL `WindowPanel` against the REAL
 * package `Drawer`: if the window manager stops wrapping or lifting its roots,
 * the window sinks under the scrim again and this goes red.
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
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

jest.mock("@/features/window-panels/utils/lazy-bundle-guard", () => ({
  assertLazyLoaded: () => undefined,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function zOf(el: Element): number {
  const inline = (el as HTMLElement).style.zIndex;
  if (inline) return Number(inline);
  const match = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el.className);
  return match ? Number(match[1] ?? match[2]) : 0;
}

function paintsAbove(layer: Element, below: Element): boolean {
  const a = zOf(layer);
  const b = zOf(below);
  if (a !== b) return a > b;
  return Boolean(
    below.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("a WindowPanel opened from inside a modal Drawer", () => {
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

  it("paints above the scrim and a press on it keeps the Drawer open", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });
    const onOpenChange = jest.fn();

    function Harness({ withWindow }: { withWindow: boolean }) {
      return (
        <Provider store={store}>
          <Drawer open onOpenChange={onOpenChange} direction="right">
            <DrawerContent>
              <DrawerTitle>Chunks, entities and attachments</DrawerTitle>
            </DrawerContent>
          </Drawer>
          {withWindow ? (
            <WindowPanel
              id="picker-from-a-modal"
              title="Attach a record"
              onClose={() => undefined}
            >
              <button type="button">Pick option</button>
            </WindowPanel>
          ) : null}
        </Provider>
      );
    }

    await act(async () => {
      root.render(<Harness withWindow={false} />);
      await Promise.resolve();
    });
    // The picker opens after the Drawer, from inside it.
    await act(async () => {
      root.render(<Harness withWindow />);
      // Radix attaches its outside-press listener on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const scrim = document.querySelector('[data-slot="drawer-overlay"]');
    const windowEl = document.querySelector(
      '[data-window-id="picker-from-a-modal"]',
    );
    expect(scrim).not.toBeNull();
    expect(windowEl).not.toBeNull();
    expect(windowEl!.closest("[data-matrx-floating-layer]")).not.toBeNull();
    expect(paintsAbove(windowEl!, scrim!)).toBe(true);

    const option = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Pick option",
    )!;
    await act(async () => {
      option.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      option.click();
      await Promise.resolve();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
