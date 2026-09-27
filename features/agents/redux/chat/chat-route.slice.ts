import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

interface ChatRouteState {
  /**
   * The composer's page mode (Chat · Work · Advanced — Amendment 1, A1). ONE
   * value for the whole tab: the top-bar switch, every composer and a
   * popped-out floating chat read it, so the floating panel "inherits the
   * mode" by construction. `null` until the first composer host seeds it from
   * the server-read cookie (`useComposerMode`).
   */
  composerMode: ComposerMode | null;
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
  composerMode: null,
  freshSessionNonce: 0,
  draftHandoff: null,
};

const chatRouteSlice = createSlice({
  name: "chatRoute",
  initialState,
  reducers: {
    setComposerMode(state, action: { payload: ComposerMode }) {
      state.composerMode = action.payload;
    },
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

export const {
  setComposerMode,
  bumpFreshSession,
  stageDraftHandoff,
  acknowledgeDraftHandoff,
} = chatRouteSlice.actions;

export default chatRouteSlice.reducer;

export const selectChatFreshSessionNonce = (state: RootState): number =>
  state.chatRoute.freshSessionNonce;

export const selectChatDraftHandoff = (state: RootState) =>
  state.chatRoute.draftHandoff;

export const selectComposerMode = (state: RootState): ComposerMode | null =>
  state.chatRoute.composerMode;
