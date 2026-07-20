import { configureStore } from "@reduxjs/toolkit";
import overlayReducer, {
  closeAllInstancesOfOverlay,
  closeAllOverlays,
  closeOverlay,
  openOverlay,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import windowManagerReducer, {
  registerWindow,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  registerWindowPersistenceFlusher,
  windowPersistenceCloseMiddleware,
} from "../persistence/windowPersistenceCloseMiddleware";
import type { OverlayId } from "../registry/overlay-ids";

const RECT = { x: 20, y: 20, width: 640, height: 420 };

function makeStore() {
  return configureStore({
    reducer: {
      overlays: overlayReducer,
      windowManager: windowManagerReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(windowPersistenceCloseMiddleware),
  });
}

function register(
  store: ReturnType<typeof makeStore>,
  overlayId: OverlayId,
  instanceId = "default",
) {
  store.dispatch(
    registerWindow({
      id: `${overlayId}-${instanceId}`,
      initial: RECT,
      persistence: {
        overlayId,
        instanceId,
        data: {},
        sidebarOpen: true,
        sidebarSize: null,
      },
    }),
  );
  store.dispatch(openOverlay({ overlayId, instanceId }));
}

describe("window preservation close middleware", () => {
  it.each([
    ["closeOverlay", () => closeOverlay({ overlayId: "messagesWindow" })],
    ["toggleOverlay", () => toggleOverlay({ overlayId: "messagesWindow" })],
    ["closeAllOverlays", () => closeAllOverlays()],
  ])("flushes after tombstoning %s", (_label, close) => {
    const store = makeStore();
    register(store, "messagesWindow");
    const closingSeen: boolean[] = [];
    const unregister = registerWindowPersistenceFlusher(() => {
      closingSeen.push(
        store.getState().windowManager.windows["messagesWindow-default"]
          .persistence?.closing === true,
      );
    });

    store.dispatch(close());
    expect(closingSeen).toEqual([true]);
    unregister();
  });

  it("tombstones every exact instance before family-close flush", () => {
    const store = makeStore();
    register(store, "singleMessageWindow", "one");
    register(store, "singleMessageWindow", "two");
    const closingSeen: boolean[] = [];
    const unregister = registerWindowPersistenceFlusher(() => {
      closingSeen.push(
        ["one", "two"].every(
          (instanceId) =>
            store.getState().windowManager.windows[
              `singleMessageWindow-${instanceId}`
            ].persistence?.closing === true,
        ),
      );
    });

    store.dispatch(
      closeAllInstancesOfOverlay({ overlayId: "singleMessageWindow" }),
    );
    expect(closingSeen).toEqual([true]);
    unregister();
  });
});
