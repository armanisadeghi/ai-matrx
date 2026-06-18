/**
 * features/transcript-studio/redux/assistantAgent.thunk.ts
 *
 * Switching the Scribe assistant's agent + flipping between the session's
 * conversations. A conversation is bound to its agent at creation, so:
 *   - `switchAssistantAgentThunk` either resumes the most recent conversation
 *     for the chosen agent (reuse) or mints a brand-new one (fresh), making it
 *     active either way.
 *   - `setActiveAssistantConversationThunk` re-activates any conversation from
 *     the roster (the agent comes along with it), rehydrating its history.
 *
 * Both persist `assistant_conversation_id` (active pointer) and
 * `assistant_conversations` (roster) onto the session row so the choice and the
 * history survive refreshes.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setShowMicrophone } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { updateSession } from "../service/studioService";
import { assistantConversationIdSet, sessionUpserted } from "./slice";
import {
  appendRoster,
  findRosterByAgent,
  findRosterByConversation,
  makeRosterRef,
  resolveDefaultAssistantAgentId,
  touchRoster,
} from "./assistantRoster";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * Persist a conversation to the session row ONLY once it is real server-side.
 *
 * A fresh conversation id is minted client-side (`generateConversationId`) and
 * does NOT exist in `cx_conversation` until the FIRST turn streams — the server
 * creates the row then (executeInstance Turn 1, `is_new:true`). Writing the id
 * to `studio_sessions.assistant_conversation_id` BEFORE that point saves a
 * placeholder that `loadConversation` later 406s on (0 rows) — the conversation
 * "disappears". So minting only updates Redux optimistically; this thunk does
 * the durable write, called from `useStudioAssistant` the moment the server has
 * confirmed the turn. Idempotent.
 */
export const persistAssistantConversationThunk = createAsyncThunk<
  void,
  { sessionId: string; conversationId: string },
  ThunkApi
>(
  "transcriptStudio/persistAssistantConversation",
  async ({ sessionId, conversationId }, { dispatch, getState }) => {
    if (!sessionId || !conversationId) return;
    const session = getState().transcriptStudio.byId[sessionId];
    if (!session) return;
    const roster = session.assistantConversations ?? [];
    // The conversation is normally already in the optimistic in-memory roster
    // (with its agent); fall back to the resolved default if not.
    const agentId =
      findRosterByConversation(roster, conversationId)?.agentId ??
      resolveDefaultAssistantAgentId(getState());
    const nextRoster = findRosterByConversation(roster, conversationId)
      ? touchRoster(roster, conversationId)
      : appendRoster(roster, makeRosterRef(conversationId, agentId));
    try {
      const updated = await updateSession(sessionId, {
        assistantConversationId: conversationId,
        assistantConversations: nextRoster,
      });
      if (updated) dispatch(sessionUpserted(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[studio] persistAssistantConversation: persist failed",
        err,
      );
    }
  },
);

async function mintInstance(
  dispatch: AppDispatch,
  agentId: string,
  conversationId?: string,
): Promise<string> {
  return dispatch(
    createManualInstance({
      agentId,
      ...(conversationId ? { conversationId } : {}),
      apiEndpointMode: "agent",
      sourceFeature: "transcript-studio",
      allowChat: true,
      autoRun: false,
      displayMode: "chat-assistant",
    }),
  ).unwrap();
}

/**
 * Re-activate an existing conversation from the session's roster. Creates the
 * local instance + rehydrates history if it isn't already in Redux.
 */
export const setActiveAssistantConversationThunk = createAsyncThunk<
  string | null,
  { sessionId: string; conversationId: string },
  ThunkApi
>(
  "transcriptStudio/setActiveAssistantConversation",
  async ({ sessionId, conversationId }, { dispatch, getState }) => {
    if (!sessionId || !conversationId) return null;
    const session = getState().transcriptStudio.byId[sessionId];
    const roster = session?.assistantConversations ?? [];
    const agentId =
      findRosterByConversation(roster, conversationId)?.agentId ??
      resolveDefaultAssistantAgentId(getState());

    const instanceExists =
      !!getState().conversations.byConversationId[conversationId];
    if (!instanceExists) {
      await mintInstance(dispatch, agentId, conversationId);
      try {
        await dispatch(loadConversation({ conversationId })).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          "[studio] setActiveAssistantConversation: loadConversation skipped",
          err,
        );
      }
    }

    dispatch(assistantConversationIdSet({ sessionId, conversationId }));
    dispatch(setShowMicrophone({ conversationId, value: true }));

    try {
      const updated = await updateSession(sessionId, {
        assistantConversationId: conversationId,
        assistantConversations: touchRoster(roster, conversationId),
      });
      if (updated) dispatch(sessionUpserted(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[studio] setActiveAssistantConversation: persist failed",
        err,
      );
    }
    return conversationId;
  },
);

/**
 * Switch the assistant to a different agent. `mode`:
 *   - "reuse" (default): if a conversation for this agent exists, resume it.
 *   - "fresh": always mint a new conversation for this agent.
 * A brand-new agent (no roster entry) always mints fresh regardless of mode.
 */
export const switchAssistantAgentThunk = createAsyncThunk<
  string | null,
  { sessionId: string; agentId: string; mode?: "reuse" | "fresh" },
  ThunkApi
>(
  "transcriptStudio/switchAssistantAgent",
  async ({ sessionId, agentId, mode = "reuse" }, { dispatch, getState }) => {
    if (!sessionId || !agentId) return null;
    const session = getState().transcriptStudio.byId[sessionId];
    const roster = session?.assistantConversations ?? [];

    const existing = findRosterByAgent(roster, agentId);
    if (existing && mode === "reuse") {
      return dispatch(
        setActiveAssistantConversationThunk({
          sessionId,
          conversationId: existing.conversationId,
        }),
      ).unwrap();
    }

    const conversationId = await mintInstance(dispatch, agentId);
    dispatch(assistantConversationIdSet({ sessionId, conversationId }));
    dispatch(setShowMicrophone({ conversationId, value: true }));

    // Optimistically track the new conversation in the in-memory roster +
    // active pointer so it shows in History immediately and is never lost if
    // the DB persist below races/fails (the old code only updated the Redux
    // roster on persist SUCCESS).
    const nextRoster = appendRoster(
      roster,
      makeRosterRef(conversationId, agentId),
    );
    const sessionNow = getState().transcriptStudio.byId[sessionId];
    if (sessionNow) {
      dispatch(
        sessionUpserted({
          ...sessionNow,
          assistantConversationId: conversationId,
          assistantConversations: nextRoster,
        }),
      );
    }

    try {
      const updated = await updateSession(sessionId, {
        assistantConversationId: conversationId,
        assistantConversations: nextRoster,
      });
      if (updated) dispatch(sessionUpserted(updated));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[studio] switchAssistantAgent: persist failed", err);
    }
    return conversationId;
  },
);
