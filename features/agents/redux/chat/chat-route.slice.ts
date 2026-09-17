import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

interface ChatRouteState {
  /** Bumped when the user explicitly starts a new chat (+). Drives reminting
   *  on fresh routes even when the URL stays on `/chat/new`. */
  freshSessionNonce: number;
  /**
   * A same-tab agent switch. This deliberately holds identities only: request
   * content remains in the initialized Redux instance, never in storage.
   */
  draftHandoff: {
    sourceConversationId: string;
    resourceSourceConversationId: string;
    connectorSourceConversationId: string;
    pinnedSourceConversationIds: string[];
    targetAgentId: string;
  } | null;
}

const initialState: ChatRouteState = {
  freshSessionNonce: 0,
  draftHandoff: null,
};

const chatRouteSlice = createSlice({
  name: "chatRoute",
  initialState,
  reducers: {
    bumpFreshSession(state) {
      state.freshSessionNonce += 1;
    },
    stageDraftHandoff(
      state,
      action: {
        payload: { sourceConversationId: string; targetAgentId: string };
      },
    ) {
      const previous = state.draftHandoff;
      state.draftHandoff = {
        sourceConversationId: action.payload.sourceConversationId,
        resourceSourceConversationId:
          previous?.resourceSourceConversationId ??
          action.payload.sourceConversationId,
        connectorSourceConversationId:
          previous?.connectorSourceConversationId ??
          action.payload.sourceConversationId,
        pinnedSourceConversationIds: Array.from(
          new Set([
            ...(previous?.pinnedSourceConversationIds ?? []),
            action.payload.sourceConversationId,
          ]),
        ),
        targetAgentId: action.payload.targetAgentId,
      };
    },
    acknowledgeDraftHandoff(
      state,
      action: { payload: { targetAgentId: string } },
    ) {
      if (state.draftHandoff?.targetAgentId === action.payload.targetAgentId) {
        state.draftHandoff = null;
      }
    },
  },
});

export const { bumpFreshSession, stageDraftHandoff, acknowledgeDraftHandoff } =
  chatRouteSlice.actions;

export default chatRouteSlice.reducer;

export const selectChatFreshSessionNonce = (state: RootState): number =>
  state.chatRoute.freshSessionNonce;

export const selectChatDraftHandoff = (state: RootState) =>
  state.chatRoute.draftHandoff;
