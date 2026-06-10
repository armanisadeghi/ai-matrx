/**
 * features/transcript-studio/redux/ensureAssistantConversation.thunk.ts
 *
 * Single entry point that guarantees a session has exactly ONE durable
 * audio-first assistant conversation, surviving refreshes:
 *
 *   1. Reuse the id already in the studio slice (a sibling mount won the race).
 *   2. Else reuse the id persisted on the session row
 *      (`studio_sessions.assistant_conversation_id`), fetching the row if it
 *      isn't in Redux yet (direct navigation to /transcripts/scribe/[id]).
 *      Create the instance keyed by that id and `loadConversation` to
 *      rehydrate full history from the DB.
 *   3. Else mint a fresh conversation, persist its id onto the session row so
 *      the NEXT load reuses it, and seed the microphone-first UI.
 *
 * Before this, useStudioAssistant minted a new client-only id on every mount,
 * so a refresh orphaned the prior (server-persisted) conversation and the
 * assistant column came up empty. The fix is purely about id durability +
 * rehydration — no extra turns are sent.
 *
 * Concurrent dispatches (the hook runs in both ScribeScreen and AssistantScreen)
 * are de-duplicated by a module-level in-flight map keyed by sessionId so two
 * mounts can never create two conversations for one session.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setShowMicrophone } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { AUDIO_ASSISTANT_AGENT_ID } from "../constants";
import { getSession, updateSession } from "../service/studioService";
import { assistantConversationIdSet, sessionUpserted } from "./slice";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * In-flight dedupe. Keyed by sessionId so the two mounts that both call this
 * thunk share one resolution instead of racing to create two conversations.
 */
const inFlight = new Map<string, Promise<string | null>>();

async function createInstanceForSession(
  dispatch: AppDispatch,
  conversationId: string | undefined,
): Promise<string> {
  return dispatch(
    createManualInstance({
      agentId: AUDIO_ASSISTANT_AGENT_ID,
      // When `conversationId` is provided we're resuming the persisted id;
      // when undefined createManualInstance mints a fresh one.
      ...(conversationId ? { conversationId } : {}),
      apiEndpointMode: "agent",
      sourceFeature: "transcript-studio",
      allowChat: true,
      autoRun: false,
      displayMode: "chat-assistant",
    }),
  ).unwrap();
}

export const ensureAssistantConversationThunk = createAsyncThunk<
  string | null,
  { sessionId: string },
  ThunkApi
>(
  "transcriptStudio/ensureAssistantConversation",
  async ({ sessionId }, { dispatch, getState }) => {
    if (!sessionId) return null;

    const existingFlight = inFlight.get(sessionId);
    if (existingFlight) return existingFlight;

    const flight = (async (): Promise<string | null> => {
      // 1. Already resolved in this tab? Done.
      const slotId =
        getState().transcriptStudio.assistantConversationIdBySession[sessionId];
      if (slotId) return slotId;

      // 2. Persisted on the session row? Reuse + rehydrate.
      let storedId =
        getState().transcriptStudio.byId[sessionId]?.assistantConversationId ??
        null;
      if (storedId === undefined || storedId === null) {
        // Session may not be in Redux yet (direct navigation). Fetch the row so
        // we don't mint a duplicate conversation for an existing session.
        try {
          const session = await getSession(sessionId);
          if (session) {
            dispatch(sessionUpserted(session));
            storedId = session.assistantConversationId;
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "[studio] ensureAssistantConversation: getSession failed",
            err,
          );
        }
      }

      if (storedId) {
        // Re-check the slot — a sibling mount may have resolved while we awaited.
        const raced =
          getState().transcriptStudio.assistantConversationIdBySession[
            sessionId
          ];
        if (raced) return raced;

        const instanceExists =
          !!getState().conversations.byConversationId[storedId];
        if (!instanceExists) {
          await createInstanceForSession(dispatch, storedId);
        }
        // Rehydrate prior turns from the DB. May 404/return empty if the
        // conversation was minted but no turn was ever sent — that's fine, the
        // local instance still works and the first turn will create the row.
        try {
          await dispatch(
            loadConversation({ conversationId: storedId }),
          ).unwrap();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[studio] ensureAssistantConversation: loadConversation skipped",
            err,
          );
        }
        dispatch(
          assistantConversationIdSet({ sessionId, conversationId: storedId }),
        );
        dispatch(setShowMicrophone({ conversationId: storedId, value: true }));
        return storedId;
      }

      // 3. Fresh conversation — mint, seed UI, persist the link for next load.
      const newConversationId = await createInstanceForSession(
        dispatch,
        undefined,
      );
      dispatch(
        assistantConversationIdSet({
          sessionId,
          conversationId: newConversationId,
        }),
      );
      dispatch(
        setShowMicrophone({ conversationId: newConversationId, value: true }),
      );
      try {
        const updated = await updateSession(sessionId, {
          assistantConversationId: newConversationId,
        });
        dispatch(sessionUpserted(updated));
      } catch (err) {
        // Loud recovery: failing to persist means the next refresh orphans
        // this conversation again — surface it rather than swallow.
        // eslint-disable-next-line no-console
        console.error(
          "[studio] ensureAssistantConversation: failed to persist assistant_conversation_id — conversation will not survive refresh",
          err,
        );
      }
      return newConversationId;
    })();

    inFlight.set(sessionId, flight);
    try {
      return await flight;
    } finally {
      inFlight.delete(sessionId);
    }
  },
);
