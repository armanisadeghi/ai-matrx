// features/agents/redux/execution-system/instance-ui-state/launch-handle-release.middleware.ts
//
// Releases a run's LAUNCH-SCOPED widget handle (features/agents/utils/
// launch-widget-handles.ts) when its result card closes or its conversation
// ends — so a menu launch never leaves its handle (and the editor element its
// write-back closes over) registered for the life of the tab.
//
// Two choke points, keyed off state read BEFORE the reducer drops it:
//  - `overlays/closeOverlay` whose instance data names a `conversationId`
//    (the inline result card, and any overlay display mode that carries one);
//  - `destroyInstance` / `destroyInstancesForAgent` (the conversation ends).
// Only launch handles are released; a surface's own handle id is a no-op.

import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "@host/lib/redux/rootReducer";
import { releaseLaunchWidgetHandle } from "../../../utils/launch-widget-handles";
import {
  destroyInstance,
  destroyInstancesForAgent,
} from "../conversations/conversations.slice";

const CLOSE_OVERLAY = "overlays/closeOverlay";
const DEFAULT_INSTANCE_ID = "default";

function handleIdOf(state: RootState, conversationId: string): string | null {
  return (
    state.instanceUIState?.byConversationId[conversationId]?.widgetHandleId ??
    null
  );
}

function closingConversationId(state: RootState, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const { overlayId, instanceId = DEFAULT_INSTANCE_ID } = payload as {
    overlayId?: string;
    instanceId?: string;
  };
  if (!overlayId) return null;
  const overlays = (state as { overlays?: { overlays?: Record<string, Record<string, { data?: unknown }>> } })
    .overlays?.overlays;
  const data = overlays?.[overlayId]?.[instanceId]?.data;
  if (!data || typeof data !== "object") return null;
  const id = (data as { conversationId?: unknown }).conversationId;
  return typeof id === "string" && id ? id : null;
}

export const launchHandleReleaseMiddleware: Middleware<object, RootState> =
  (store) => (next) => (action) => {
    const before = store.getState();
    const release: string[] = [];
    const a = action as { type?: string; payload?: unknown };

    if (a.type === CLOSE_OVERLAY) {
      const conversationId = closingConversationId(before, a.payload);
      const id = conversationId ? handleIdOf(before, conversationId) : null;
      if (id) release.push(id);
    } else if (destroyInstance.match(action)) {
      if (!before.conversations?.debugSessionActive) {
        const id = handleIdOf(before, action.payload);
        if (id) release.push(id);
      }
    } else if (destroyInstancesForAgent.match(action)) {
      if (!before.conversations?.debugSessionActive) {
        for (const cid of before.conversations?.allConversationIds ?? []) {
          if (before.conversations.byConversationId[cid]?.agentId !== action.payload) continue;
          const id = handleIdOf(before, cid);
          if (id) release.push(id);
        }
      }
    }

    const result = next(action);
    for (const id of release) releaseLaunchWidgetHandle(id);
    return result;
  };
