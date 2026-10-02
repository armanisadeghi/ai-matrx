/**
 * editorState slice — per-conversation IdeState snapshot for the
 * `editor-state` client capability.
 *
 * Mirrors the same source data the legacy `instanceContext` `vsc_*` keys are
 * fed from, but in the structured `IdeState` shape the new capability
 * envelope expects. The `editor-state` provider in
 * `features/agents/redux/execution-system/client-capabilities/` reads this
 * slice on every turn — when present, the agent's request gains
 * `client.capabilities += "editor-state"` and the server brings the
 * `vsc_get_state` tool online.
 *
 * Populated by `useIdeContextSync` in the agent code editor surface. Future
 * surfaces (Chrome extension, desktop) that wire their own ide-aware caller
 * dispatch into this same slice.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { IdeState } from "@ai-matrx/chat/agents/types/agent-api-types";

interface EditorStateSliceState {
  byConversationId: Record<string, IdeState | null>;
}

const initialState: EditorStateSliceState = {
  byConversationId: {},
};

const editorStateSlice = createSlice({
  name: "editorState",
  initialState,
  reducers: {
    setEditorState(
      state,
      action: PayloadAction<{
        conversationId: string;
        state: IdeState | null;
      }>,
    ) {
      const { conversationId, state: ideState } = action.payload;
      state.byConversationId[conversationId] = ideState;
    },
    clearEditorState(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      delete state.byConversationId[action.payload.conversationId];
    },
  },
});

export const { setEditorState, clearEditorState } = editorStateSlice.actions;
export const editorStateReducer = editorStateSlice.reducer;

export interface WithEditorState {
  editorState: EditorStateSliceState;
}

export function selectEditorState(
  state: WithEditorState,
  conversationId: string,
): IdeState | null {
  return state.editorState.byConversationId[conversationId] ?? null;
}
