/**
 * A run's launch-scoped widget handle (Replace / Insert below write-back) is
 * released when its result card closes or its conversation ends — a menu
 * launch never leaves its handle (and the editor element it closes over)
 * registered for the life of the tab. A surface's own handle is never touched.
 *
 * Real reducers (overlays, conversations, instanceUIState) + the real
 * middleware; the handles are real callbackManager entries.
 */

import { configureStore, type Middleware } from "@reduxjs/toolkit";
import overlaysReducer, { closeOverlay, openOverlay } from "@host/lib/redux/slices/overlaySlice";
import conversationsReducer, {
  createInstance,
  destroyInstance,
  destroyInstancesForAgent,
} from "../conversations/conversations.slice";
import instanceUIStateReducer, { initInstanceUIState } from "./instance-ui-state.slice";
import { launchHandleReleaseMiddleware } from "./launch-handle-release.middleware";
import {
  liveLaunchWidgetHandleCount,
  registerLaunchWidgetHandle,
} from "../../../utils/launch-widget-handles";
import { callbackManager } from "@host/utils/callbackManager";
import type { SelectionWriteBack } from "../../../types/widget-handle.types";

const writeBack: SelectionWriteBack = {
  originalText: "Skip to main content | Patient portal",
  replace: () => true,
  insertBelow: () => true,
};

function makeStore() {
  return configureStore({
    reducer: {
      overlays: overlaysReducer,
      conversations: conversationsReducer,
      instanceUIState: instanceUIStateReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(
        launchHandleReleaseMiddleware as Middleware,
      ),
  });
}

function launch(store: ReturnType<typeof makeStore>, conversationId: string, agentId = "agent-1") {
  const surfaceId = callbackManager.registerWidgetHandle({ onTextReplace: () => {} });
  const id = registerLaunchWidgetHandle(surfaceId, writeBack)!;
  store.dispatch(
    createInstance({ conversationId, agentId, agentType: "user", origin: "shortcut" } as never),
  );
  store.dispatch(initInstanceUIState({ conversationId, displayMode: "inline", widgetHandleId: id }));
  return { id, surfaceId };
}

describe("launch-scoped widget handles are released", () => {
  it("when the run's result card closes", () => {
    const store = makeStore();
    const before = liveLaunchWidgetHandleCount();
    const { id, surfaceId } = launch(store, "conv-close");
    store.dispatch(
      openOverlay({ overlayId: "agentInlineOverlay", instanceId: "card-1", data: { conversationId: "conv-close" } }),
    );
    expect(liveLaunchWidgetHandleCount()).toBe(before + 1);

    store.dispatch(closeOverlay({ overlayId: "agentInlineOverlay", instanceId: "card-1" }));

    expect(callbackManager.get(id)).toBeUndefined();
    expect(liveLaunchWidgetHandleCount()).toBe(before);
    // The surface's own handle belongs to its hook — never released here.
    expect(callbackManager.get(surfaceId)).toBeDefined();
  });

  it("when the conversation ends", () => {
    const store = makeStore();
    const before = liveLaunchWidgetHandleCount();
    const { id } = launch(store, "conv-end");
    store.dispatch(destroyInstance("conv-end"));
    expect(callbackManager.get(id)).toBeUndefined();
    expect(liveLaunchWidgetHandleCount()).toBe(before);
  });

  it("when every conversation of its agent ends", () => {
    const store = makeStore();
    const before = liveLaunchWidgetHandleCount();
    const a = launch(store, "conv-a", "agent-x");
    const b = launch(store, "conv-b", "agent-x");
    const other = launch(store, "conv-c", "agent-y");
    store.dispatch(destroyInstancesForAgent("agent-x"));
    expect(callbackManager.get(a.id)).toBeUndefined();
    expect(callbackManager.get(b.id)).toBeUndefined();
    expect(callbackManager.get(other.id)).toBeDefined();
    expect(liveLaunchWidgetHandleCount()).toBe(before + 1);
  });
});
