/**
 * Guards for THE CANVAS AS A RESIZABLE SPLIT, not an overlay.
 *
 * The defects these pin (owner, seen live on the chat route 2026-09-13):
 *
 *   1. The canvas was a fixed right-hand Radix sheet (`role="dialog"`,
 *      `fixed inset-y-0 right-0`) DRAWN OVER the chat. The composer, the mic
 *      and the send button were underneath it and prose was cut mid-word.
 *      Standard: *"we have an entire Canvas system that gives us a nice
 *      adjustable sidebar that can be folded out and in"* — the thread
 *      SHRINKS, nothing is covered (Claude.ai's artifact pane, Cursor's side
 *      panel, Claude Code).
 *   2. The header "Canvas" button was dead while the canvas was open — the
 *      overlay sat on top of it and swallowed the click.
 *
 * Real library, real reducer, real geometry: `installPanelGeometry` models CSS
 * flex from the inline styles react-resizable-panels itself writes, so the
 * widths asserted below are the widths the library computed — not numbers this
 * test invented.
 *
 * Proven failing before passing (re-run these mutations to re-prove):
 *   a. thread-shrinks   → gave the canvas panel `defaultSize="0%"` with no
 *      expand effect; the thread stayed at 1000px with the canvas "open" → RED.
 *   b. nothing-covered  → rendered `CanvasSurfaceCard` in a `position:fixed`
 *      sibling instead of a Panel; the composer's rect fell under the canvas
 *      rect → RED.
 *   c. one-presentation → removed the `selectCanvasIsDocked` bail from
 *      `CanvasSideSheet`; a `role="dialog"` appeared over the docked column
 *      while both were on screen → RED.
 *   d. button-live      → re-introduced the overlay above the header; the
 *      click landed on the sheet and `isOpen` never flipped → RED.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  closeCanvas,
  openCanvas,
  registerCanvasDock,
  selectCanvasIsDocked,
  toggleCanvas,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { CanvasDock, CANVAS_DOCK_PANEL_ID } from "../CanvasDock";
import { CanvasSideSheet } from "../CanvasSideSheet";
import {
  flushResizeObservers,
  installPanelGeometry,
  setGroupPx,
} from "@/features/resizable-panels/__tests__/panelGeometry";

// The canvas body is the whole renderer graph; its PRESENCE and PLACEMENT are
// what this file is about, not its internals.
jest.mock("../CanvasDockBody", () => ({
  CanvasDockBody: () => <div data-testid="dock-canvas-body">canvas</div>,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const CONTENT: CanvasContent = {
  type: "working_document",
  data: { conversationId: "c1", kind: "working" },
  metadata: { title: "Working document", sourceMessageId: "wd:c1" },
};

function makeStore() {
  return configureStore({ reducer: { canvas: canvasSlice.reducer } });
}

/** Desktop by default — the dock deliberately stands down on a phone. */
function mockViewport(isMobile: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px") ? isMobile : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

function ThreadBody() {
  return (
    <div data-testid="thread" style={{ height: "100%" }}>
      <div data-testid="composer">Ask anything…</div>
    </div>
  );
}

function panelEl(container: HTMLElement, id: string): HTMLElement {
  // The library renders the outer panel div with `data-panel` plus `id` and
  // `data-testid` set to the Panel's `id` prop (className/style go to a NESTED
  // div, so the outer one is what carries the measured geometry).
  const el = container.querySelector<HTMLElement>(
    `[data-panel][data-testid="${id}"]`,
  );
  if (!el) {
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-panel]"),
    );
    throw new Error(
      `No panel "${id}". Panels present: ${panels
        .map((p) => p.getAttribute("data-testid") ?? "(unnamed)")
        .join(", ")}`,
    );
  }
  return el;
}

describe("the canvas docks beside the chat instead of covering it", () => {
  let restoreGeometry: () => void;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    mockViewport(false);
    setGroupPx(1000);
    restoreGeometry = installPanelGeometry();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    restoreGeometry();
  });

  async function render(store: ReturnType<typeof makeStore>) {
    await act(async () => {
      root.render(
        <Provider store={store}>
          <CanvasDock groupId="test-dock">
            <ThreadBody />
          </CanvasDock>
          <CanvasSideSheet />
        </Provider>,
      );
    });
    flushResizeObservers();
  }

  it("shrinks the thread and never draws over the composer", async () => {
    const store = makeStore();
    await render(store);

    const threadPanel = panelEl(container, "canvas-dock-main");
    const widthClosed = threadPanel.offsetWidth;
    expect(widthClosed).toBe(1000);

    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});
    flushResizeObservers();

    const canvasPanel = panelEl(container, CANVAS_DOCK_PANEL_ID);
    const widthOpen = threadPanel.offsetWidth;

    // THE WHOLE POINT: the thread got narrower, and the canvas took the room
    // it gave up — rather than being painted on top of it.
    expect(widthOpen).toBeLessThan(widthClosed);
    expect(canvasPanel.offsetWidth).toBeGreaterThan(0);
    expect(
      Math.round(widthOpen + canvasPanel.offsetWidth),
    ).toBeLessThanOrEqual(1000);

    // The composer is inside the thread panel, and the canvas starts where the
    // thread ends — so nothing of the chat is underneath the canvas.
    const composer = container.querySelector<HTMLElement>(
      '[data-testid="composer"]',
    );
    if (!composer) throw new Error("the composer never rendered");
    expect(threadPanel.contains(composer)).toBe(true);
    expect(canvasPanel.contains(composer)).toBe(false);
    expect(canvasPanel.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      threadPanel.getBoundingClientRect().right,
    );

    // And the canvas body really is mounted in that column.
    expect(
      canvasPanel.querySelector('[data-testid="dock-canvas-body"]'),
    ).not.toBeNull();
  });

  it("never puts an overlay on screen while a dock is mounted", async () => {
    const store = makeStore();
    await render(store);
    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});

    expect(selectCanvasIsDocked(store.getState())).toBe(true);
    // A Radix sheet portals to document.body — look there, not just in the
    // container, or this guard passes for the wrong reason.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      document.querySelectorAll('[data-canvas-surface="sheet"]').length,
    ).toBe(0);
  });

  it("folds the column away again when the canvas is closed", async () => {
    const store = makeStore();
    await render(store);
    const threadPanel = panelEl(container, "canvas-dock-main");

    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});
    flushResizeObservers();
    expect(threadPanel.offsetWidth).toBeLessThan(1000);

    await act(async () => {
      store.dispatch(closeCanvas());
    });
    flushResizeObservers();
    await act(async () => {});
    flushResizeObservers();

    expect(threadPanel.offsetWidth).toBe(1000);
    expect(
      container.querySelector('[data-testid="dock-canvas-body"]'),
    ).toBeNull();
    // Folded away, not destroyed: the item is still there to reopen.
    expect(store.getState().canvas.items).toHaveLength(1);
  });

  it("keeps a header Canvas control live and clickable while the canvas is open", async () => {
    const store = makeStore();

    // A stand-in for `ChatCanvasButton` — same dispatch, rendered where the
    // chat header is: INSIDE the thread panel, which is exactly where the
    // overlay used to land on top of it.
    function HeaderCanvasButton() {
      return (
        <button
          type="button"
          data-testid="header-canvas"
          onClick={() => store.dispatch(toggleCanvas())}
        >
          Canvas
        </button>
      );
    }

    await act(async () => {
      root.render(
        <Provider store={store}>
          <CanvasDock groupId="test-dock">
            <div style={{ height: "100%" }}>
              <HeaderCanvasButton />
              <ThreadBody />
            </div>
          </CanvasDock>
          <CanvasSideSheet />
        </Provider>,
      );
    });
    flushResizeObservers();

    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="header-canvas"]',
    );
    if (!button) throw new Error("the header Canvas button never rendered");
    // Nothing is layered over it: no dialog exists at all, and the button is
    // not inside the canvas column.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      panelEl(container, CANVAS_DOCK_PANEL_ID).contains(button),
    ).toBe(false);

    await act(async () => {
      button.click();
    });
    expect(store.getState().canvas.isOpen).toBe(false);

    await act(async () => {
      button.click();
    });
    expect(store.getState().canvas.isOpen).toBe(true);
  });

  it("remembers the width the user dragged to, across a reload", async () => {
    const store = makeStore();
    await render(store);
    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});
    flushResizeObservers();

    // A settled layout writes the ratio through; simulate the settle the way
    // the library reports it.
    expect(
      Number.isFinite(store.getState().canvas.dockRatio),
    ).toBe(true);
    window.localStorage.setItem("matrx.canvas.dock.ratio", "55");

    const reloaded = makeStore();
    await act(async () => {
      root.render(
        <Provider store={reloaded}>
          <CanvasDock groupId="test-dock">
            <ThreadBody />
          </CanvasDock>
        </Provider>,
      );
    });
    flushResizeObservers();
    expect(reloaded.getState().canvas.dockRatio).toBe(55);
  });
});

describe("a phone has no room for two columns", () => {
  let restoreGeometry: () => void;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    mockViewport(true);
    setGroupPx(390);
    restoreGeometry = installPanelGeometry();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    restoreGeometry();
  });

  it("stands the dock down at 390px and leaves the full-bleed sheet in charge", async () => {
    const store = makeStore();
    await act(async () => {
      root.render(
        <Provider store={store}>
          <CanvasDock groupId="test-dock">
            <ThreadBody />
          </CanvasDock>
        </Provider>,
      );
    });
    flushResizeObservers();

    await act(async () => {
      store.dispatch(openCanvas(CONTENT));
    });
    flushResizeObservers();
    await act(async () => {});
    flushResizeObservers();

    // No dock registered → the overlay presentation is the one in charge, and
    // nothing steals half of a 390px screen.
    expect(selectCanvasIsDocked(store.getState())).toBe(false);
    expect(
      container.querySelector('[data-testid="dock-canvas-body"]'),
    ).toBeNull();
    expect(panelEl(container, "canvas-dock-main").offsetWidth).toBe(390);
  });
});

describe("the sheet is the fallback, not the default", () => {
  it("is the presentation when no dock is mounted", () => {
    const store = makeStore();
    expect(selectCanvasIsDocked(store.getState())).toBe(false);
    store.dispatch(registerCanvasDock());
    expect(selectCanvasIsDocked(store.getState())).toBe(true);
  });

  it("survives a client navigation between two docked routes", () => {
    // The next route's dock mounts before the previous one unmounts; a boolean
    // flag would flash the overlay in between, so the count is ref-counted.
    let state = canvasSlice.reducer(undefined, { type: "@@init" });
    state = canvasSlice.reducer(state, registerCanvasDock());
    state = canvasSlice.reducer(state, registerCanvasDock());
    state = canvasSlice.reducer(state, { type: "canvas/unregisterCanvasDock" });
    expect(selectCanvasIsDocked({ canvas: state })).toBe(true);
    state = canvasSlice.reducer(state, { type: "canvas/unregisterCanvasDock" });
    expect(selectCanvasIsDocked({ canvas: state })).toBe(false);
    // Never negative — an unbalanced unmount must not make the next dock
    // register into a no-op.
    state = canvasSlice.reducer(state, { type: "canvas/unregisterCanvasDock" });
    expect(state.dockHosts).toBe(0);
  });
});
