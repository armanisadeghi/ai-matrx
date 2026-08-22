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

jest.mock("@/features/window-panels/utils/lazy-bundle-guard", () => ({
  assertLazyLoaded: () => undefined,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WindowPanel minimize boundary", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body
      .querySelectorAll("[data-window-panel-state]")
      .forEach((node) => node.parentElement?.parentElement?.remove());
    jest.restoreAllMocks();
  });

  it("still minimizes when a feature collector throws", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPanel
            id="throwing-collector-window"
            title="Throwing collector"
            overlayId="browserWorkbenchWindow"
            onClose={() => undefined}
            onCollectData={() => {
              throw new Error("collector failed");
            }}
          >
            body
          </WindowPanel>
        </Provider>,
      );
      await Promise.resolve();
    });

    const minimize = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Minimize"]',
    );
    expect(minimize).not.toBeNull();

    await act(async () => {
      minimize?.click();
      await Promise.resolve();
    });

    expect(
      store.getState().windowManager.windows["throwing-collector-window"].state,
    ).toBe("minimized");
  });

  it("can register directly into the tray without a windowed flash", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPanel
            id="initially-minimized-window"
            title="Working on it"
            overlayId="liveRunWindow"
            overlayInstanceId="assist-run"
            initialState="minimized"
          >
            body
          </WindowPanel>
        </Provider>,
      );
      await Promise.resolve();
    });

    const entry =
      store.getState().windowManager.windows["initially-minimized-window"];
    expect(entry.state).toBe("minimized");
    expect(entry.traySlot).toBe(0);
    expect(entry.preMinimizedRect).not.toBeNull();
  });

  it("retains a stateful body across minimize and restore when opted in", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        adminDebug: adminDebugReducer,
        urlSync: urlSyncReducer,
      },
    });
    const onMount = jest.fn();
    const onUnmount = jest.fn();

    function StatefulBody() {
      React.useEffect(() => {
        onMount();
        return onUnmount;
      }, []);
      return <div>live context</div>;
    }

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPanel
            id="retained-body-window"
            title="Retained body"
            overlayId="agentRunWindow"
            retainBodyOnMinimize
          >
            <StatefulBody />
          </WindowPanel>
        </Provider>,
      );
      await Promise.resolve();
    });

    const minimize = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Minimize"]',
    );
    await act(async () => {
      minimize?.click();
      await Promise.resolve();
    });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onUnmount).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("live context");

    const restore = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Restore"]',
    );
    await act(async () => {
      restore?.click();
      await Promise.resolve();
    });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onUnmount).not.toHaveBeenCalled();
  });
});
