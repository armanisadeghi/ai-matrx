/**
 * Guards for THE CLASS: "an artifact/document the agent says it opened silently
 * fails to reach the canvas."
 *
 * The live defect (production chat route, conversation
 * bb458c1e-3222-4c16-9d29-77c48b186a02, 2026-09-14): a reviewer asked the chat
 * agent to create a markdown document and open it as a document artifact in the
 * canvas. The agent called the `document` tool, then said «Created and opened as
 * a document artifact: Canvas Hijack Check». Nothing opened. No tab by that name
 * existed and NO failure was shown.
 *
 * The frontend half of that is the class these guards pin, not the one tool:
 *
 *   1. An open-in-canvas request that cannot be honoured must ANNOUNCE itself
 *      with a remedy (law 4), never `return` silently. Dispatching into a route
 *      with no canvas surface is the worst case — the slice accepts the item,
 *      `isOpen` flips, and absolutely nothing renders.
 *   2. A DOCKED route is a canvas surface. `selectCanvasIsAvailable` only ever
 *      read the flag the global (idle-deferred) `CanvasSideSheet` raises, so a
 *      route showing the canvas as a resizable column reported "no canvas here"
 *      until that island happened to hydrate — hiding every availability-gated
 *      Canvas affordance, and (with guard 1 in place) refusing real opens.
 *
 * Proven failing before passing — re-run these mutations to re-prove:
 *   a. announces-unreachable → removed the `ensureCanvasReachable` guard from
 *      `useCanvas().open`; the open returned `undefined`, no toast was raised,
 *      and the item landed in a slice nothing renders → RED.
 *   b. announces-no-data     → removed the `data == null` guard; silent → RED.
 *   c. dock-is-a-surface     → reverted `selectCanvasIsAvailable` to
 *      `state.canvas?.isAvailable ?? false`; a mounted dock reported the canvas
 *      unavailable and the document open was REFUSED with a false error → RED.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  registerCanvasDock,
  selectCanvasIsAvailable,
  selectCanvasItems,
  setCanvasAvailable,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

function makeStore() {
  return configureStore({
    reducer: { canvas: canvasSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

type Store = ReturnType<typeof makeStore>;

/** Mount a component that exposes `useCanvas().open` to the test. */
function mountOpener(store: Store) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const api: { open: ((c: CanvasContent) => boolean) | null } = { open: null };

  function Probe() {
    const canvas = useCanvas();
    api.open = canvas.open;
    return null;
  }

  act(() => {
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });

  return {
    open: (content: CanvasContent) => {
      const open = api.open;
      if (!open) throw new Error("probe never mounted");
      let result: boolean | undefined;
      act(() => {
        result = open(content);
      });
      return result;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const DOCUMENT_REQUEST: CanvasContent = {
  type: "working_document",
  data: { conversationId: "bb458c1e-3222-4c16-9d29-77c48b186a02", kind: "working" },
  metadata: {
    title: "Canvas Hijack Check",
    sourceMessageId: "wd:bb458c1e:working",
  },
};

beforeEach(() => {
  toastError.mockClear();
});

describe("an open-in-canvas request never silently does nothing", () => {
  it("announces-unreachable: refusing an open on a route with no canvas surface is VISIBLE, not a no-op", () => {
    const store = makeStore();
    // No sheet mounted, no dock mounted — exactly the state in which the slice
    // used to accept the item and render nothing at all.
    expect(selectCanvasIsAvailable(store.getState())).toBe(false);

    const probe = mountOpener(store);
    const opened = probe.open(DOCUMENT_REQUEST);

    expect(opened).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    const [headline, options] = toastError.mock.calls[0] as [
      string,
      { description?: string },
    ];
    // The person is told WHAT was dropped and WHAT to do — not just "error".
    expect(headline).toContain("Canvas Hijack Check");
    expect(headline.toLowerCase()).toContain("canvas");
    expect(options?.description ?? "").not.toHaveLength(0);
    // And nothing was parked in a slice nobody renders.
    expect(selectCanvasItems(store.getState())).toHaveLength(0);

    probe.unmount();
  });

  it("announces-no-data: an open carrying no content is VISIBLE, not a no-op", () => {
    const store = makeStore();
    act(() => {
      store.dispatch(setCanvasAvailable(true));
    });

    const probe = mountOpener(store);
    const opened = probe.open({
      type: "working_document",
      data: null,
      metadata: { title: "Canvas Hijack Check" },
    } as CanvasContent);

    expect(opened).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(selectCanvasItems(store.getState())).toHaveLength(0);

    probe.unmount();
  });

  it("dock-is-a-surface: a document opens into the canvas while a dock is mounted and the sheet island has not hydrated", () => {
    const store = makeStore();
    // The dock is the DEFAULT presentation; `CanvasSideSheet` is idle-deferred,
    // so `isAvailable` is still false at this moment on a real chat route.
    act(() => {
      store.dispatch(registerCanvasDock());
    });
    expect(store.getState().canvas.isAvailable).toBe(false);
    expect(selectCanvasIsAvailable(store.getState())).toBe(true);

    const probe = mountOpener(store);
    const opened = probe.open(DOCUMENT_REQUEST);

    expect(opened).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
    const items = selectCanvasItems(store.getState());
    expect(items).toHaveLength(1);
    expect(items[0].content.type).toBe("working_document");
    expect(store.getState().canvas.isOpen).toBe(true);
    expect(store.getState().canvas.currentItemId).toBe(items[0].id);

    probe.unmount();
  });
});
