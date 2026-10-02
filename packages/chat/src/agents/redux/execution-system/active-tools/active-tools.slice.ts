/**
 * activeTools slice — bumps a per-conversation revision counter every time
 * the backend emits a `RESOURCE_CHANGED` event with `kind: "active_tools"`.
 *
 * Backend behavior (per FRONTEND_TOOL_INJECTION_NOTES.md):
 *   Tools that need to load other tools (e.g. the Chrome-extension
 *   discovery tool) mutate the active tool set via an internal API; the
 *   orchestrator drains pending mutations between turns and emits this
 *   event with metadata `{added: int, removed: int}`.
 *
 * Toolbar / capability-display UI reads `revisionByConversationId[id]` and
 * refetches whenever it changes. The slice intentionally stores nothing
 * about which tools were added — the UI's source of truth for the active
 * set is whatever the toolbar fetcher returns; this slice is just a
 * cache-bust signal.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface ActiveToolsState {
  /**
   * Monotonic per-conversation counter — increments on every active-tools
   * invalidation event. Components subscribe to this and refetch.
   */
  revisionByConversationId: Record<string, number>;
  /** Most recent `{added, removed}` counts per conversation, for UX hints. */
  lastDeltaByConversationId: Record<
    string,
    { added: number; removed: number }
  >;
}

const initialState: ActiveToolsState = {
  revisionByConversationId: {},
  lastDeltaByConversationId: {},
};

const activeToolsSlice = createSlice({
  name: "activeTools",
  initialState,
  reducers: {
    invalidateActiveTools(
      state,
      action: PayloadAction<{
        conversationId: string;
        added?: number;
        removed?: number;
      }>,
    ) {
      const { conversationId, added = 0, removed = 0 } = action.payload;
      state.revisionByConversationId[conversationId] =
        (state.revisionByConversationId[conversationId] ?? 0) + 1;
      state.lastDeltaByConversationId[conversationId] = { added, removed };
    },
    clearActiveTools(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      delete state.revisionByConversationId[action.payload.conversationId];
      delete state.lastDeltaByConversationId[action.payload.conversationId];
    },
  },
});

export const { invalidateActiveTools, clearActiveTools } =
  activeToolsSlice.actions;
export const activeToolsReducer = activeToolsSlice.reducer;

export interface WithActiveTools {
  activeTools: ActiveToolsState;
}

export function selectActiveToolsRevision(
  state: WithActiveTools,
  conversationId: string,
): number {
  return state.activeTools.revisionByConversationId[conversationId] ?? 0;
}

export function selectActiveToolsLastDelta(
  state: WithActiveTools,
  conversationId: string,
): { added: number; removed: number } | null {
  return state.activeTools.lastDeltaByConversationId[conversationId] ?? null;
}
