import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import windowManagerReducer, {
  WINDOW_SESSION_SCHEMA_VERSION,
  hydrateWindowSessions,
  windowSessionKey,
  type HydratedWindowSession,
} from "@/lib/redux/slices/windowManagerSlice";
import { useWindowPanel } from "@/features/window-panels/hooks/useWindowPanel";
import { traySlotRect } from "@/features/window-panels/constants/tray";

const FULL_RECT = { x: 40, y: 30, width: 500, height: 360 };

function Harness() {
  useWindowPanel({
    id: "strict-window",
    width: 320,
    height: 240,
    persistence: {
      overlayId: "messagesWindow",
      instanceId: "default",
      data: {},
      sidebarOpen: true,
      sidebarSize: 240,
    },
  });
  return null;
}

describe("useWindowPanel preservation lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("survives the StrictMode probe cleanup and confirms after stable mount", () => {
    const store = configureStore({
      reducer: { windowManager: windowManagerReducer },
    });
    const sessionKey = windowSessionKey("messagesWindow", "default");
    const session: HydratedWindowSession = {
      schemaVersion: WINDOW_SESSION_SCHEMA_VERSION,
      sessionKey,
      overlayId: "messagesWindow",
      instanceId: "default",
      windowId: "strict-window",
      title: "Strict restored",
      state: "minimized",
      windowedRect: FULL_RECT,
      renderRect: traySlotRect(0, window.innerWidth, window.innerHeight),
      traySlot: 0,
      zIndex: 1000,
      sidebarOpen: true,
      sidebarSize: 240,
      data: {},
      savedAt: 10,
    };
    store.dispatch(
      hydrateWindowSessions({
        sessions: [session],
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );

    act(() => {
      root.render(
        <StrictMode>
          <Provider store={store}>
            <Harness />
          </Provider>
        </StrictMode>,
      );
    });

    expect(store.getState().windowManager.windows["strict-window"]).toMatchObject(
      {
        state: "minimized",
        preMinimizedRect: FULL_RECT,
      },
    );
    expect(
      store.getState().windowManager.pendingRestores[sessionKey],
    ).toBeDefined();

    act(() => jest.runOnlyPendingTimers());
    expect(
      store.getState().windowManager.pendingRestores[sessionKey],
    ).toBeUndefined();
    expect(store.getState().windowManager.windows["strict-window"]).toBeDefined();
  });
});

