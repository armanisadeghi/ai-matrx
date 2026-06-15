/**
 * surfaceColdPendingCalls — COLD-RESUME entry point.
 *
 * When a user opens a conversation that the server has left `paused` waiting on
 * one or more client-delegated tool calls (they closed the tab mid-prompt and
 * came back — minutes, hours, or weeks later), this fetches those persisted
 * `cx_tool_call` rows (`GET /ai/conversation/{id}/pending_calls`) and re-surfaces
 * each one through `surfaceDelegatedToolCall` — the SAME path a live
 * `tool_delegated` stream event takes. The user answers exactly as they would
 * have live; the answer flows through `submitToolResult` → `continuation_needed`
 * → `resumeInstance`, continuing the agent loop.
 *
 * Call this once per genuinely-cold conversation load (after `loadConversation`),
 * NOT when a stream is already live in memory. See
 * features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

import { fetchConversationPendingCalls } from "@/features/agents/api/fetch-pending-calls";
import { surfaceDelegatedToolCall } from "./surface-delegated-tool-call.thunk";
import { selectActivePendingAsksForConversation } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";

/** Returns the number of pending calls surfaced (0 when there are none). */
export const surfaceColdPendingCalls = (
  conversationId: string,
): ThunkAction<Promise<number>, RootState, unknown, UnknownAction> => {
  return async (dispatch, getState) => {
    if (!conversationId) return 0;

    const calls = await dispatch(fetchConversationPendingCalls(conversationId));
    if (!calls.length) return 0;

    let surfaced = 0;
    for (const call of calls) {
      // Idempotency: if a prompt for this call_id is already on screen (a live
      // arrival, or a prior cold-resume pass on a remount), don't double-surface
      // it — re-running a ui-first handler would register a second resolver.
      const activeAsks =
        selectActivePendingAsksForConversation(conversationId)(getState());
      if (activeAsks.some((a) => a.callId === call.call_id)) continue;

      dispatch(
        surfaceDelegatedToolCall({
          conversationId,
          // The persisted suspended turn. Resume keys off the server's
          // continuation_needed response, not this id — it's only used here for
          // lifecycle bookkeeping, so fall back gracefully if ever absent.
          requestId: call.user_request_id ?? `cold-${call.call_id}`,
          callId: call.call_id,
          toolName: call.tool_name,
          // Reconstruct the live `tool_delegated` data shape ({ arguments })
          // from the persisted cx_tool_call.arguments so the dispatched/stored
          // shape is byte-identical to the live path.
          data: { arguments: call.arguments ?? {} },
        }),
      );
      surfaced++;
    }
    return surfaced;
  };
};
