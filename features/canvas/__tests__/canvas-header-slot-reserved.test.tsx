/**
 * THE HEADER BUTTONS NEVER MOVE — THE CANVAS SLOT IS ALWAYS RESERVED, AND IT
 * ALWAYS HOLDS THE CONTROL.
 *
 * THE REJECTION this pins (owner, 2026-09-16; re-found live on production
 * 2026-09-18, review row 34bfd1e8-1cc2-441b-a8a9-42d78c1b6111):
 *   *"…causes a shift in the top header buttons…"*
 *
 * and the ruling that shaped the control's states (owner, 2026-09-19, the
 * header right set): *"never hiding things and only disabling when inactive"*.
 *
 * THE LAW: when the canvas is AVAILABLE on a route, the slot exists, is the
 * same width in every state, and holds ONE button. With nothing in the canvas
 * the button is `disabled` and its tooltip says why; with items and the
 * canvas folded away it opens; with the canvas open it is pressed and puts the
 * canvas away. Never an unmounted slot, never an inert spacer pretending to
 * be nothing.
 *
 * PROVEN FAILING BEFORE PASSING — re-run these mutations to re-prove:
 *   a. `if (!isAvailable || itemCount === 0) return null;` → "reserves the
 *      slot before any canvas item exists" and "same width" go RED.
 *   b. render an aria-hidden spacer for the empty state → "the empty state is
 *      a disabled control that says why" goes RED.
 *   c. drop `disabled` from the empty state → the same case goes RED.
 *
 * Widths are asserted as the CSS the element carries, not as laid-out pixels —
 * jsdom computes no layout. The laid-out proof is the Playwright gate
 * `features/shell/layout-gate/canvas-one-presentation.spec.ts`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  closeCanvas,
  openCanvas,
  setCanvasAvailable,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import {
  CANVAS_EMPTY_TOOLTIP,
  CanvasShellHeaderToggle,
} from "@/features/canvas/core/CanvasHeaderToggle";
import { TooltipProvider } from "@/components/ui/tooltip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONTENT: CanvasContent = {
  type: "code",
  data: { code: "print('hi')", language: "python" },
  metadata: { title: "hello.py", sourceMessageId: "msg-1" },
};

function makeStore() {
  return configureStore({
    reducer: { canvas: canvasSlice.reducer },
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
}

type Harness = {
  store: ReturnType<typeof makeStore>;
  host: HTMLDivElement;
  root: Root;
  slot: () => HTMLElement | null;
  unmount: () => void;
};

function mount(): Harness {
  const store = makeStore();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <CanvasShellHeaderToggle />
        </TooltipProvider>
      </Provider>,
    );
  });
  return {
    store,
    host,
    root,
    slot: () => host.querySelector<HTMLElement>("[data-canvas-header-slot]"),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** What the element actually declares for width — the only layout fact jsdom keeps. */
function declaredWidth(el: HTMLElement | null): string | null {
  return el ? el.style.width : null;
}

describe("canvas shell header slot", () => {
  let h: Harness;

  beforeEach(() => {
    h = mount();
  });

  afterEach(() => {
    h.unmount();
  });

  it("renders nothing on a route with no canvas surface", () => {
    // isAvailable defaults to false — CanvasSideSheet is not mounted here.
    expect(h.slot()).toBeNull();
    expect(h.host.innerHTML).toBe("");
  });

  it("reserves the slot before any canvas item exists", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
    });

    const slot = h.slot();
    expect(slot).not.toBeNull();
    expect(slot!.dataset.canvasHeaderSlot).toBe("control");
    expect(slot!.dataset.canvasHeaderSlotState).toBe("empty");
    expect(declaredWidth(slot)).toBe("var(--matrx-tap-target-size, 2.75rem)");
  });

  it("the empty state is a disabled control that says why", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
    });

    const slot = h.slot()!;
    expect(slot.getAttribute("aria-hidden")).toBeNull();
    const button = slot.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);
    expect(button!.getAttribute("aria-label")).toBe("Canvas (empty)");
    expect(CANVAS_EMPTY_TOOLTIP).toMatch(/empty/);
  });

  it("opens the canvas once an item exists and the canvas is folded away", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
      h.store.dispatch(openCanvas(CONTENT));
      h.store.dispatch(closeCanvas());
    });

    const slot = h.slot()!;
    expect(slot.dataset.canvasHeaderSlotState).toBe("closed");
    const button = slot.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Open canvas — hello.py");

    act(() => {
      button.click();
    });
    expect(h.store.getState().canvas.isOpen).toBe(true);
  });

  it("puts the canvas away while it is open", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
      h.store.dispatch(openCanvas(CONTENT));
    });

    const slot = h.slot()!;
    expect(slot.dataset.canvasHeaderSlotState).toBe("open");
    const button = slot.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(
      "Put away canvas — hello.py",
    );

    act(() => {
      button.click();
    });
    expect(h.store.getState().canvas.isOpen).toBe(false);
  });

  it("the slot is the same width in all three states", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
    });
    const empty = declaredWidth(h.slot());

    act(() => {
      h.store.dispatch(openCanvas(CONTENT));
    });
    const open = declaredWidth(h.slot());

    act(() => {
      h.store.dispatch(closeCanvas());
    });
    const folded = declaredWidth(h.slot());

    expect(empty).toBe("var(--matrx-tap-target-size, 2.75rem)");
    expect(open).toBe(empty);
    expect(folded).toBe(empty);
  });

  it("the slot leaves with the canvas surface", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
    });
    expect(h.slot()).not.toBeNull();

    act(() => {
      h.store.dispatch(setCanvasAvailable(false));
    });
    expect(h.slot()).toBeNull();
  });
});
