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
 * Destroys a conversation ONLY if it has no committed messages AND no live
 * composer work. A first turn is still real work while it is crossing the
 * async submit boundary: `markInputSubmitted` runs before the optimistic user
 * bubble exists, and a handoff may unmount the launching composer in that
 * window. Deleting on message-count alone loses that turn and leaves the
 * destination surface pointing at a conversation that no longer exists.
 * Used by surfaces that may unmount mid-handoff (the chat route promotes its
 * URL from `/chat/new` → `/chat/[conversationId]` right after submit, which
 * unmounts the launcher). A plain destroy-on-unmount would wipe the pending
 * first turn or an unsent draft; this preserves any conversation the user
 * actually started while still cleaning up truly-empty instances they clicked
 * away from.
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
    const input = state.instanceUserInput.byConversationId[conversationId];
    const hasComposerWork =
      Boolean(input?.text.length) ||
      Boolean(input?.messageParts?.length) ||
      (input != null && input.submissionPhase !== "idle");
    if (hasComposerWork) return;
    // CONFIGURING A RUN IS WORK. Attaching an MCP server, a tool, or a skill
    // from the `+` menu is a deliberate act that happens BEFORE most people
    // type a word — on `/chat/new` it is usually the first thing they do. Judging
    // "abandoned" on messages and composer text alone reaped conversations the
    // person had already configured, and the attachment vanished with no notice.
    const added =
      state.instanceUIState.byConversationId[conversationId]
        ?.builderAdvancedSettings;
    const hasRunConfiguration =
      Boolean(added?.addedTools?.length) ||
      Boolean(added?.addedMcpServers?.length) ||
      Boolean(added?.addedSkills?.length);
    if (hasRunConfiguration) return;
    dispatch(destroyInstance(conversationId));
  };
