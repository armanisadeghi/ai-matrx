"use client";

/**
 * setPageContextEnabled — the ONE on/off for "this chat sees the page", used
 * by the composer's page-context chip.
 *
 *   off → remember the surface the conversation was receiving, clear its
 *         stamp, and drop the values the page already handed over.
 *   on  → restore that surface and READ THE PAGE NOW (`refreshSurfaceScope`),
 *         so the values are back in the composer at once — not on the next
 *         send. Without the read, "on" looked like it did nothing.
 *
 * A host whose chat follows the page (`useConversationFollowsPage`) honours
 * the same flag, so the two never fight.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { patchConversation } from "../conversations/conversations.slice";
import { replaceSurfaceVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { replaceSurfaceContextEntries } from "../instance-context/instance-context.slice";
import { clearPageContextOff, setPageContextOff } from "../instance-ui-state/instance-ui-state.slice";
import { refreshSurfaceScope } from "./refresh-surface-scope.thunk";

export const setPageContextEnabled = createAsyncThunk<
  void,
  { conversationId: string; enabled: boolean },
  { state: RootState; dispatch: AppDispatch }
>("instances/setPageContextEnabled", async ({ conversationId, enabled }, { getState, dispatch }) => {
  const state = getState();
  if (!enabled) {
    const previousSurfaceName = state.conversations.byConversationId[conversationId]?.surfaceName ?? null;
    dispatch(setPageContextOff({ conversationId, previousSurfaceName }));
    dispatch(patchConversation({ conversationId, surfaceName: null }));
    dispatch(replaceSurfaceVariableValues({ conversationId, values: {} }));
    dispatch(replaceSurfaceContextEntries({ conversationId, entries: [] }));
    return;
  }
  const previousSurfaceName = state.instanceUIState.pageContextOffByConversationId?.[conversationId]?.previousSurfaceName ?? null;
  dispatch(clearPageContextOff({ conversationId }));
  if (previousSurfaceName) dispatch(patchConversation({ conversationId, surfaceName: previousSurfaceName }));
  await dispatch(refreshSurfaceScope({ conversationId }));
});
