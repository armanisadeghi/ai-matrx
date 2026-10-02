/**
 * Load the conversation an `agent_call` child ran in, so a RELOADED transcript
 * can draw the child's thinking and tool calls under the card that ran it —
 * the same items the live stream showed (Arman, 2026-10-01). See
 * `utils/agent-call-trace.ts`.
 *
 * Only the two transcript dimensions are hydrated (messages + tool-call rows):
 * the child conversation is never focused, never given an instance, and never
 * re-read when it is already in the store (a chat surface that opened it owns
 * that copy). One read per conversation at a time — the card renders once per
 * mount and several cards may name the same child.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@host/lib/redux/store";
import { hydrateMessages } from "../messages/messages.slice";
import { hydrateObservability } from "../observability/observability.slice";
import {
  describeSupabaseError,
  extractBundleToolCalls,
  fetchConversationBundle,
  messageRowToRecord,
  toolCallRowToRecord,
} from "./conversation-bundle";

/** The child's whole run — agent_call children are bounded (max iterations). */
const CHILD_MESSAGE_LIMIT = 200;

const inFlight = new Map<string, Promise<void>>();

export const loadAgentCallChildConversation = createAsyncThunk<
  void,
  { childConversationId: string },
  { dispatch: AppDispatch; state: RootState }
>(
  "conversations/loadAgentCallChild",
  async ({ childConversationId }, { dispatch, getState }) => {
    if (
      (getState().messages.byConversationId[childConversationId]?.orderedIds
        ?.length ?? 0) > 0
    ) {
      return;
    }
    const pending = inFlight.get(childConversationId);
    if (pending) return pending;
    const work = (async () => {
      try {
        const bundle = await fetchConversationBundle(childConversationId, {
          messageLimit: CHILD_MESSAGE_LIMIT,
        });
        dispatch(
          hydrateMessages({
            conversationId: childConversationId,
            messages: bundle.messages.map(messageRowToRecord),
          }),
        );
        dispatch(
          hydrateObservability({
            conversationId: childConversationId,
            userRequests: [],
            requests: [],
            toolCalls: extractBundleToolCalls(bundle).map(toolCallRowToRecord),
          }),
        );
      } catch (err) {
        console.error(
          "[loadAgentCallChildConversation] could not read the sub-agent conversation %s: %s",
          childConversationId,
          describeSupabaseError(err),
        );
        throw err;
      } finally {
        inFlight.delete(childConversationId);
      }
    })();
    inFlight.set(childConversationId, work);
    return work;
  },
);
