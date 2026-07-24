import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import windowManagerReducer from "@/lib/redux/slices/windowManagerSlice";
import { useWindowPanel } from "@/features/window-panels/hooks/useWindowPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function ResizeHarness() {
  const panel = useWindowPanel({
    id: "resize-window",
    width: 720,
    height: 520,
    minWidth: 380,
    minHeight: 320,
  });

  return (
    <div
      data-testid="resize-handle"
      onPointerDown={panel.onResizeStart("se")}
    />
  );
}

describe("useWindowPanel resize constraints", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("honors the window's declared minimum width and height", () => {
    const store = configureStore({
      reducer: { windowManager: windowManagerReducer },
    });

    act(() => {
      root.render(
        <Provider store={store}>
          <ResizeHarness />
        </Provider>,
      );
    });

    const handle = container.querySelector<HTMLElement>(
      '[data-testid="resize-handle"]',
    );
    expect(handle).not.toBeNull();

    act(() => {
      handle?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 720,
          clientY: 520,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 0,
          clientY: 0,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 0,
          clientY: 0,
        }),
      );
    });

    expect(
      store.getState().windowManager.windows["resize-window"].windowed,
    ).toMatchObject({
      width: 380,
      height: 320,
    });
  });
});
