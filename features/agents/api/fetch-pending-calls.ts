/**
 * fetch-pending-calls — clients for the two pending-call discovery endpoints.
 *
 *   GET /ai/conversation/{id}/pending_calls   → calls waiting in one conversation
 *   GET /ai/user/pending_calls                → every pending call for this user
 *
 * A "pending call" is a client-delegated tool call the model emitted (via a
 * `tool_delegated` stream event) that has NOT yet been answered. The server
 * persists these in `cx_tool_call` with `status='delegated'`, so they survive
 * SSE disconnects, browser reloads, and server restarts. This endpoint is how
 * the client discovers them after a reconnect.
 *
 * Typical usage:
 *
 *   - On conversation load, dispatch `fetchConversationPendingCalls(id)` — if
 *     the list is non-empty, the UI should surface the prompts just as if the
 *     original SSE had delivered them live.
 *   - On app shell mount, dispatch `fetchUserPendingCalls()` — drive a global
 *     "N tool prompts waiting" badge.
 *
 * These thunks are pure reads; they do not mutate server state.
 */

import { callApi } from "@/lib/api/call-api";
import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

// ── Local types ──────────────────────────────────────────────────────────────
//
// These mirror the FastAPI `PendingCallSummary` response model at
// aidream/api/routers/conversations.py. Once the python-generated api-types
// are re-run against a backend that exposes the new endpoints, replace this
// block with:
//
//     import type { components } from "@/types/python-generated/api-types";
//     export type PendingCallSummary = components["schemas"]["PendingCallSummary"];

export type PendingCallSummary = components["schemas"]["PendingCallSummary"];

// ── Thunks ───────────────────────────────────────────────────────────────────

/**
 * Fetch all client-delegated tool calls awaiting this user's response in a
 * single conversation. Safe to call on every conversation load.
 */
export const fetchConversationPendingCalls = (
  conversationId: string,
): ThunkAction<
  Promise<PendingCallSummary[]>,
  RootState,
  unknown,
  UnknownAction
> => {
  return async (dispatch) => {
    const result = await dispatch(
      callApi({
        path: "/ai/conversation/{conversation_id}/pending_calls",
        method: "GET",
        pathParams: { conversation_id: conversationId },
      }),
    );
    if (result.error) {
      // eslint-disable-next-line no-console
      console.warn(
        "[fetch-pending-calls] conversation fetch failed",
        result.error,
      );
      return [];
    }
    return (result.data ?? []) as PendingCallSummary[];
  };
};

/** Same read as above, but transport/server errors reject instead of becoming []. */
export const fetchConversationPendingCallsStrict = (
  conversationId: string,
): ThunkAction<
  Promise<PendingCallSummary[]>,
  RootState,
  unknown,
  UnknownAction
> => {
  return async (dispatch) => {
    const result = await dispatch(
      callApi({
        path: "/ai/conversation/{conversation_id}/pending_calls",
        method: "GET",
        pathParams: { conversation_id: conversationId },
      }),
    );
    if (result.error) {
      throw new Error(
        result.error.message ??
          `Pending-call check failed with HTTP ${result.error.status ?? "unknown"}`,
      );
    }
    return (result.data ?? []) as PendingCallSummary[];
  };
};

/**
 * Fetch every client-delegated tool call awaiting this user's response across
 * every conversation they own. Powers a global app-shell "N waiting" badge.
 */
export const fetchUserPendingCalls = (): ThunkAction<
  Promise<PendingCallSummary[]>,
  RootState,
  unknown,
  UnknownAction
> => {
  return async (dispatch) => {
    const result = await dispatch(
      callApi({
        path: "/ai/user/pending_calls",
        method: "GET",
      }),
    );
    if (result.error) {
      // eslint-disable-next-line no-console
      console.warn("[fetch-pending-calls] user fetch failed", result.error);
      return [];
    }
    return (result.data ?? []) as PendingCallSummary[];
  };
};
