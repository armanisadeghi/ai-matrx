/**
 * THE HEADER BUTTONS NEVER MOVE — THE CANVAS SLOT IS ALWAYS RESERVED.
 *
 * THE REJECTION this pins (owner, 2026-09-16; re-found live on production
 * 2026-09-18, review row 34bfd1e8-1cc2-441b-a8a9-42d78c1b6111):
 *   *"…causes a shift in the top header buttons…"*
 *
 * The 2026-09-17 fix held the slot between OPEN and CLOSED, but the component
 * still returned `null` while `itemCount === 0`, so the FIRST canvas item both
 * created the 44px box and pushed every button left of it sideways — and
 * folding the canvas away never gave the space back. Measured on
 * `https://www.aimatrx.com`, one chat, one click:
 *
 *   Records               1043.39 → 999.39
 *   Canvas                1132    → 1088
 *   Conversation actions  1164    → 1120
 *   Agents for this page  1192    → 1148
 *
 * THE LAW: when the canvas is AVAILABLE on a route, the slot exists and is the
 * same width in every state. Only its contents change — an inert, aria-hidden
 * spacer when there is nothing to reopen or while the canvas pane's own header
 * owns the control, the real button otherwise. Never a dead or disabled-looking
 * button.
 *
 * PROVEN FAILING BEFORE PASSING — re-run these mutations to re-prove:
 *   a. restore `if (!isAvailable || itemCount === 0) return null;` (the code as
 *      it shipped) → "reserves the slot before any canvas item exists" and
 *      "the slot is the same width in all three states" go RED.
 *   b. give the empty-state spacer no width (drop `CANVAS_HEADER_SLOT_BOX`) →
 *      the same-width case goes RED.
 *   c. render the spacer as a real `LayersTapButton` again → "the reserved slot
 *      is inert and holds no button" goes RED.
 *
 * Measured 2026-09-18 with mutation (a) applied: 2 failed / 5 passed; reverted:
 * 7 passed.
 *
 * Widths are asserted as the CSS the element carries, not as laid-out pixels —
 * jsdom computes no layout. The laid-out proof is the Playwright gate
 * `features/shell/layout-gate/canvas-one-presentation.spec.ts` plus the live
 * production measurements in
 * `common-docs/operations/for-arman/2026-09-18/canvas-header-shift-fixed/`.
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
import { CanvasShellHeaderToggle } from "@/features/canvas/core/CanvasHeaderToggle";
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
    expect(slot!.dataset.canvasHeaderSlot).toBe("reserved");
    expect(slot!.dataset.canvasHeaderSlotReason).toBe("empty");
    expect(declaredWidth(slot)).toBe("var(--matrx-tap-target-size, 2.75rem)");
  });

  it("the reserved slot is inert and holds no button", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
    });

    const slot = h.slot()!;
    expect(slot.querySelector("button")).toBeNull();
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    // Nothing focusable, nothing that looks pressable-but-dead.
    expect(slot.querySelectorAll("[tabindex], a, input").length).toBe(0);
    expect(slot.textContent).toBe("");
  });

  it("renders the real control once an item exists and the canvas is folded away", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
      h.store.dispatch(openCanvas(CONTENT));
      h.store.dispatch(closeCanvas());
    });

    const slot = h.slot()!;
    expect(slot.dataset.canvasHeaderSlot).toBe("control");
    const button = slot.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.getAttribute("aria-label")).toBe("Open canvas — hello.py");
  });

  it("keeps the slot (without the control) while the canvas is open", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
      h.store.dispatch(openCanvas(CONTENT));
    });

    const slot = h.slot()!;
    expect(slot.dataset.canvasHeaderSlot).toBe("reserved");
    expect(slot.dataset.canvasHeaderSlotReason).toBe("open");
    expect(slot.querySelector("button")).toBeNull();
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

  it("the slot survives adding a second item and folding away", () => {
    act(() => {
      h.store.dispatch(setCanvasAvailable(true));
      h.store.dispatch(openCanvas(CONTENT));
      h.store.dispatch(
        openCanvas({
          ...CONTENT,
          metadata: { title: "second.py", sourceMessageId: "msg-2" },
        }),
      );
      h.store.dispatch(closeCanvas());
    });

    const slot = h.slot()!;
    expect(slot.dataset.canvasHeaderSlot).toBe("control");
    expect(declaredWidth(slot)).toBe("var(--matrx-tap-target-size, 2.75rem)");
    // The count badge rides inside the reserved box, never widening it.
    expect(slot.textContent).toBe("2");
  });
});
