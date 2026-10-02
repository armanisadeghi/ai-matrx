/**
 * forkAndRunServer — atomic "fork + new turn" via the streaming server
 * endpoint. Replaces the legacy 3-call pattern (`forkConversation` →
 * `editMessage` → `executeInstance`) used by the "Edit & Resubmit (Fork)"
 * flow in `UserActionBar.tsx`.
 *
 * Endpoint: `POST /ai/conversations/{id}/fork-and-run` (streaming).
 *
 * Stream wire shape:
 *   • FIRST event:   `{ kind: "conversation.forked", new_conversation_id, ... }`
 *     — see `features/agents/types/conversation-stream-events.ts`.
 *   • Subsequent events: identical to `POST /ai/conversations/{id}` —
 *     `record_reserved`, `chunk`, `tool_event`, `end`, ...
 *
 * **WIRE-UP-FIRST, INTEGRATION-LATER:** This thunk captures the new
 * `conversation_id` from the first event, dispatches `loadConversation` after
 * the stream completes to materialize the new conversation in Redux, and
 * exposes per-event callbacks so a caller can drive UI feedback. It does NOT
 * yet plug into `processStream` for live token-by-token rendering into the
 * fork's slice entries. Once we've validated the endpoint end-to-end, the
 * follow-up is to route subsequent events into `processStream` with the new
 * `conversation_id` so the user watches the new turn stream into the fork
 * exactly like a normal continuation. Until then this is honest atomic
 * fork-and-run with a post-completion hydration.
 *
 * Does NOT touch any existing thunk or call site. Opt in per surface.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callConversationForkAndRun,
  type ApiCallError,
  type ConversationForkAndRunBody,
} from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import {
  isConversationForkedEvent,
  type ConversationForkedEvent,
} from "@/features/agents/types/conversation-stream-events";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { setFocus } from "../../conversation-focus/conversation-focus.slice";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface ForkAndRunServerArgs {
  /** Source conversation to fork from. */
  conversationId: string;
  /**
   * Full ForkAndRunRequest body. Caller supplies fork selector
   * (`from_message_id` + `exclusive`, or `up_to_position`) and the
   * standard turn payload (`user_input`, `tools`, etc.). Default values are
   * NOT injected here — pass the body in OpenAPI shape.
   */
  body: ConversationForkAndRunBody;
  /**
   * Optional surface key. When set, focus jumps to the new conversation
   * the instant `conversation.forked` arrives — so the user watches the
   * new turn stream in (post-integration) rather than seeing it land in
   * the source.
   */
  surfaceKey?: string;
  /** Optional per-event callbacks for UI wiring. */
  onForked?: (event: ConversationForkedEvent) => void;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (newConversationId: string | null) => void;
  onStreamError?: (error: ApiCallError) => void;
  signal?: AbortSignal;
}

interface ForkAndRunServerResult {
  /** The new conversation id, captured from the `conversation.forked` event. */
  newConversationId: string;
  sourceConversationId: string;
  forkedAtPosition: number | null;
  /** Number of messages copied into the fork from the source. */
  copiedMessageCount: number;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const forkAndRunServer = createAsyncThunk<
  ForkAndRunServerResult,
  ForkAndRunServerArgs,
  ThunkApi
>(
  "conversations/forkAndRunServer",
  async (args, { dispatch, rejectWithValue }) => {
    const {
      conversationId,
      body,
      surfaceKey,
      onForked,
      onStreamEvent,
      onStreamComplete,
      onStreamError,
      signal,
    } = args;

    let forkedEvent: ConversationForkedEvent | null = null;

    const result = await dispatch(
      callConversationForkAndRun({
        conversationId,
        body,
        signal,
        onStreamEvent: (event) => {
          // First event on the stream is `conversation.forked` — capture
          // the new id and (optionally) navigate the surface so the user
          // watches the fork rather than the source.
          if (!forkedEvent && isConversationForkedEvent(event)) {
            forkedEvent = event;
            onForked?.(event);
            if (surfaceKey) {
              dispatch(
                setFocus({
                  surfaceKey,
                  conversationId: event.new_conversation_id,
                }),
              );
            }
            // Don't double-forward the fork event to the caller's
            // generic event handler — it's not a TypedStreamEvent.
            return;
          }
          onStreamEvent?.(event);
        },
        onStreamComplete: () => {
          onStreamComplete?.(forkedEvent?.new_conversation_id ?? null);
        },
        onStreamError,
      }),
    );

    if (result.error) {
      onStreamError?.(result.error);
      return rejectWithValue({
        message:
          result.error.message ??
          `fork-and-run failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }

    if (!forkedEvent) {
      return rejectWithValue({
        message:
          "fork-and-run stream completed without emitting a `conversation.forked` event",
      });
    }

    // Once the stream is done, materialize the new conversation in Redux.
    // The streamed turn already wrote its rows server-side; loadConversation
    // pulls the bundle so messages, observability, variables, and overrides
    // come up in one round-trip.
    const forked = forkedEvent as ConversationForkedEvent;
    try {
      await dispatch(
        loadConversation({ conversationId: forked.new_conversation_id }),
      ).unwrap();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[forkAndRunServer] loadConversation after stream failed",
        err,
      );
      return rejectWithValue({
        message: `fork-and-run streamed successfully but rehydration failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }

    // Cache invalidation for both ends — same rationale as forkConversationServer.
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    dispatch(
      markCacheBypass({
        conversationId: forked.new_conversation_id,
        conversation: true,
      }),
    );
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(
      invalidateConversationCache({
        conversationId: forked.new_conversation_id,
      }),
    );

    return {
      newConversationId: forked.new_conversation_id,
      sourceConversationId: forked.source_conversation_id,
      forkedAtPosition: forked.forked_at_position,
      copiedMessageCount: forked.message_count,
    };
  },
);
