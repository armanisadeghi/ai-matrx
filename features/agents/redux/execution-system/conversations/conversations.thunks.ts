import type { AppThunk } from "@/lib/redux/store";
import {
  destroyInstance,
  destroyInstancesForAgent,
} from "./conversations.slice";

/**
 * Destroys a conversation only when debug-session mode is NOT active.
 * Use this everywhere instead of dispatching `destroyInstance` directly —
 * it ensures debug-retained sessions are never accidentally wiped.
 */
export const destroyInstanceIfAllowed =
  (conversationId: string): AppThunk =>
  (dispatch, getState) => {
    if (getState().conversations.debugSessionActive) return;
    dispatch(destroyInstance(conversationId));
  };

/**
 * Destroys all conversations for an agent only when debug-session mode is
 * NOT active.
 */
export const destroyInstancesForAgentIfAllowed =
  (agentId: string): AppThunk =>
  (dispatch, getState) => {
    if (getState().conversations.debugSessionActive) return;
    dispatch(destroyInstancesForAgent(agentId));
  };

/**
 * Destroys a conversation ONLY if it's "abandoned" — i.e. it has no messages.
 * Used by surfaces that may unmount mid-handoff (the chat route promotes its
 * URL from `/chat/new` → `/chat/[conversationId]` right after submit, which
 * unmounts the launcher). A plain destroy-on-unmount would wipe the in-flight
 * stream; this preserves any conversation the user actually started while
 * still cleaning up truly-empty instances they clicked away from.
 *
 * Respects debug-session mode like the others (never wipes a retained debug
 * session).
 */
export const destroyInstanceIfAbandoned =
  (conversationId: string): AppThunk =>
  (dispatch, getState) => {
    const state = getState();
    if (state.conversations.debugSessionActive) return;
    const messageCount =
      state.messages.byConversationId[conversationId]?.orderedIds?.length ?? 0;
    if (messageCount > 0) return; // real conversation — keep it
    dispatch(destroyInstance(conversationId));
  };
