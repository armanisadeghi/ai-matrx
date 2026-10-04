import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import windowManagerReducer, {
  maximizeWindow,
  restoreWindow,
} from "@/lib/redux/slices/windowManagerSlice";
import adminDebugReducer from "@/lib/redux/preferences/adminDebugSlice";
import urlSyncReducer from "@/lib/redux/slices/urlSyncSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

jest.mock("@/features/window-panels/utils/lazy-bundle-guard", () => ({
  assertLazyLoaded: () => undefined,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("WindowPanel desktop maximize", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("preserves the measured windowed rect across fullscreen observations and resumes fitting on restore", async () => {
    const observers: ControlledResizeObserver[] = [];
    class ControlledResizeObserver implements ResizeObserver {
      readonly observe = jest.fn();
      readonly unobserve = jest.fn();
      readonly disconnect = jest.fn();

      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }

      emit(width: number, height: number) {
        this.callback(
          [{ contentRect: { width, height } as DOMRectReadOnly } as ResizeObserverEntry],
          this,
        );
      }
    }
    globalThis.ResizeObserver = ControlledResizeObserver;

    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });
    const id = "fit-content-maximize";
    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPanel
            id={id}
            title="Fitting panel"
            onClose={() => undefined}
            fitContent
            initialRect={{ x: 100, y: 80, width: 640, height: 420 }}
          >
            <div>Windowed content</div>
          </WindowPanel>
        </Provider>,
      );
      await Promise.resolve();
    });

    expect(observers).toHaveLength(1);
    await act(async () => observers[0].emit(640, 420));
    const savedRect = { ...store.getState().windowManager.windows[id].windowed };
    expect(savedRect.width).toBe(640);
    expect(savedRect.height).toBe(420);

    await act(async () => {
      store.dispatch(maximizeWindow(id));
      await Promise.resolve();
    });
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(observers).toHaveLength(1);
    expect(document.querySelector<HTMLElement>(`[data-window-id="${id}"]`)?.style.width).toBe("100vw");

    // A queued delivery can run after disconnect; fullscreen must never save its size.
    await act(async () => observers[0].emit(1024, 768));
    expect(store.getState().windowManager.windows[id].windowed).toEqual(savedRect);

    await act(async () => {
      store.dispatch(restoreWindow(id));
      await Promise.resolve();
    });
    expect(store.getState().windowManager.windows[id].windowed).toEqual(savedRect);
    expect(observers).toHaveLength(2);
    expect(observers[1].observe).toHaveBeenCalledTimes(1);
    await act(async () => observers[0].emit(1024, 768));
    expect(store.getState().windowManager.windows[id].windowed).toEqual(savedRect);
    await act(async () => observers[1].emit(700, 480));
    expect(store.getState().windowManager.windows[id].windowed).toEqual({
      ...savedRect,
      width: 700,
      height: 480,
    });
  });

  it("keeps one mounted body and its edited text through maximize and restore", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });
    const mounted = jest.fn();
    const unmounted = jest.fn();

    function StatefulBody() {
      const [text, setText] = React.useState("");
      React.useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return (
        <input
          aria-label="Draft subject"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      );
    }

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPanel
            id="maximize-preserves-body"
            title="Draft"
            onClose={() => undefined}
            width={640}
            height={420}
          >
            <StatefulBody />
          </WindowPanel>
        </Provider>,
      );
      await Promise.resolve();
    });

    const panel = document.querySelector<HTMLElement>(
      '[data-window-id="maximize-preserves-body"]',
    );
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Draft subject"]',
    );
    expect(panel).not.toBeNull();
    expect(input).not.toBeNull();
    expect(panel?.style.width).toBe("640px");
    expect(panel?.style.height).toBe("420px");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Edited subject");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(input?.value).toBe("Edited subject");

    await act(async () => {
      store.dispatch(maximizeWindow("maximize-preserves-body"));
      await Promise.resolve();
    });
    expect(store.getState().windowManager.windows["maximize-preserves-body"].state).toBe("maximized");
    expect(document.querySelector('[data-window-id="maximize-preserves-body"]')).toBe(panel);
    expect(document.querySelector('input[aria-label="Draft subject"]')).toBe(input);
    expect(input?.value).toBe("Edited subject");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    expect(panel?.style.inset).toBe("0");
    expect(panel?.style.width).toBe("100vw");
    expect(panel?.style.height).toBe("100dvh");

    await act(async () => {
      store.dispatch(restoreWindow("maximize-preserves-body"));
      await Promise.resolve();
    });
    expect(document.querySelector('[data-window-id="maximize-preserves-body"]')).toBe(panel);
    expect(document.querySelector('input[aria-label="Draft subject"]')).toBe(input);
    expect(input?.value).toBe("Edited subject");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    expect(panel?.style.inset).toBe("");
    expect(panel?.style.width).toBe("640px");
    expect(panel?.style.height).toBe("420px");
  });
});
