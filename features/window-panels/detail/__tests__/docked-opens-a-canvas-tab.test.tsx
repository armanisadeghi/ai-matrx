/**
 * The Detail primitive's DOCKED presentation is a canvas tab (`record-peek`),
 * never a second floating right panel.
 *
 * Drives the REAL host binding (`DetailHost`) under a real `@ai-matrx/canvas`
 * controller: `open({ presentation: "docked" })` — what `useOpenDetail()` calls
 * when a person's setting says "docked" — must put the record on the canvas as
 * ONE tab keyed by the record, focus that same tab when it is opened again, and
 * give a second record its own tab.
 *
 * Proven failing before passing: with `DetailHost`'s docked branch pointed back
 * at an overlay opener (`openWindow(data)` in place of `openCanvasItem(...)`),
 * every assertion on `items` below is RED (the canvas holds nothing).
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import { createCanvasStore, selectCanvasActiveItem, type CanvasStoreBinding } from "@ai-matrx/canvas";
import { CanvasProvider, useCanvas } from "@ai-matrx/canvas/react";
import { useDetailHost, type DetailHostPorts } from "@ai-matrx/detail/react";
import overlays from "@/lib/redux/slices/overlaySlice";
import { DetailHost } from "@/features/window-panels/detail/DetailHost";
import { RECORD_PEEK_KIND } from "@/features/window-panels/detail/canvas/recordPeek";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
  recordToast: { info: jest.fn() },
}));

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

function mount() {
  const canvasStore: CanvasStoreBinding = createCanvasStore();
  const store = configureStore({ reducer: { overlays } });
  const api: { open: DetailHostPorts["open"] | null } = { open: null };
  function Probe() {
    api.open = useDetailHost().open;
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <CanvasProvider store={canvasStore} persistence={null}>
          <PresentedColumn />
          <DetailHost>
            <Probe />
          </DetailHost>
        </CanvasProvider>
      </Provider>,
    );
  });
  return {
    canvasStore,
    store,
    open: (id: string, name: string | null = null) =>
      act(() => {
        api.open?.({
          presentation: "docked",
          data: { type: "task", id, seed: name ? { name, about: null } : null, list: null },
        });
      }),
    unmount: () => act(() => root.unmount()),
  };
}

describe("the docked detail presentation", () => {
  it("opens the record as a record-peek canvas tab, keyed by the record", () => {
    const m = mount();
    m.open(A, "Write the brief");
    const state = m.canvasStore.getState();
    const items = Object.values(state.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: RECORD_PEEK_KIND, key: `task.${A}`, title: "Write the brief" });
    expect(state.isOpen).toBe(true);
    // Nothing floats beside the canvas.
    expect(Object.values(m.store.getState().overlays).some((o) => (o as { isOpen?: boolean }).isOpen)).toBe(false);
    m.unmount();
  });

  it("focuses the same tab when the same record opens again, and gives another record its own", () => {
    const m = mount();
    m.open(A, "Write the brief");
    m.open(B);
    m.open(A);
    const state = m.canvasStore.getState();
    expect(Object.keys(state.items)).toHaveLength(2);
    expect(selectCanvasActiveItem(state)?.key).toBe(`task.${A}`);
    // Re-opening without a seed keeps the name the tab already had.
    expect(selectCanvasActiveItem(state)?.title).toBe("Write the brief");
    m.unmount();
  });
});
