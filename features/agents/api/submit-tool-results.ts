/**
 * submit-tool-results — client for POST /ai/conversations/{id}/tool_results.
 *
 * This is the SINGLE FUNNEL for client tool results. Every ui-first / widget /
 * client-delegated tool answer flows through `submitToolResult` → batcher →
 * `postToolResults`. Do not POST to /tool_results from anywhere else (an
 * ESLint chokepoint enforces this — see `eslint.config.mjs`); bypassing the
 * funnel forfeits the `continuation_needed` → `resumeInstance` handoff and
 * reintroduces the "stream never resumes after ask-user" bug.
 *
 * Widget actions resolve fast (most are synchronous `setState` calls). When
 * the model issues several widget_* tools in one iteration they all resolve
 * in the same JS tick. To avoid racing the server's resumption logic with
 * N parallel POSTs, we coalesce results in a microtask-window batcher:
 *
 *   - Each resolved tool enqueues into a per-conversation bucket.
 *   - The first enqueue schedules a `queueMicrotask` flush.
 *   - On flush, we send one POST per conversationId containing every queued
 *     result (the endpoint accepts `results: ClientToolResult[]` natively).
 *
 * The server's response includes `continuation_needed: boolean`. When `true`
 * (the original SSE has ended — hard-suspended after delegating — and no
 * delegated calls remain outstanding for the user_request), we dispatch
 * `resumeInstance` to reopen the stream against `/ai/conversations/{id}/resume`.
 * The batcher already coalesces to one POST per conversation per tick, so at
 * most one resume fires per coalesce window.
 *
 * A POST that returns 404 (`not_found`) is logged as a warning, not thrown —
 * the contract in CLIENT_SIDE_TOOLS.md explicitly says duplicate / expired
 * call_ids return 404 and the stream stays alive.
 *
 * See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md for the full
 * suspend → submit → resume round-trip.
 */

import { callApi } from "@/lib/api/call-api";
import type { ThunkAction, ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

type ToolResultsDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;
import type { components } from "@/types/python-generated/api-types";

type ClientToolResult = components["schemas"]["ClientToolResult"];
type ToolResultsResponse = components["schemas"]["ToolResultsResponse"];

export interface PendingToolResult extends ClientToolResult {
  conversationId: string;
}

// ── Module-level queue + scheduling ──────────────────────────────────────────

const queue: Map<string, ClientToolResult[]> = new Map();
let scheduled = false;

function scheduleFlush(dispatch: ToolResultsDispatch): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => flushQueue(dispatch));
}

function flushQueue(dispatch: ToolResultsDispatch): void {
  scheduled = false;
  if (queue.size === 0) return;

  const entries = Array.from(queue.entries());
  queue.clear();

  for (const [conversationId, results] of entries) {
    if (results.length === 0) continue;
    dispatch(postToolResults(conversationId, results));
  }
}

function postToolResults(
  conversationId: string,
  results: ClientToolResult[],
): ThunkAction<Promise<void>, RootState, unknown, UnknownAction> {
  return async (dispatch) => {
    try {
      const result = await dispatch(
        callApi({
          path: "/ai/conversations/{conversation_id}/tool_results",
          method: "POST",
          pathParams: { conversation_id: conversationId },
          body: { results },
        }),
      );
      if (result.error) {
        if (result.error.status === 404) {
          // Duplicate or expired call_id(s). Stream remains alive — log only.
          console.warn(
            "[submit-tool-results] 404 not_found — call_id(s) already resolved or expired",
            result.error,
          );
        } else {
          console.error("[submit-tool-results] POST failed", result.error);
        }
        return;
      }

      // Continuation handshake. When the original stream is gone (hard-suspended
      // after delegating) AND the last outstanding client-delegated call just
      // cleared, the server flags `continuation_needed=true` and returns the
      // owning `user_request_id`. We reopen the agent loop against the resume
      // endpoint — see features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
      //
      // When the live in-memory waiter on the originating stream picked up the
      // result, `continuation_needed=false` and the existing stream keeps
      // streaming under us — we do nothing.
      const data = result.data as ToolResultsResponse | undefined;
      if (data?.continuation_needed && data.user_request_id) {
        // Dynamic import breaks the would-be cycle:
        // submit-tool-results → resume-instance → run-ai-stream → process-stream
        //   → dispatch-ui-first-tool → submit-tool-results.
        // executeInstance uses the same pattern for cache-bypass + clearUserInput.
        const { resumeInstance } = await import(
          "@/features/agents/redux/execution-system/thunks/resume-instance.thunk"
        );
        void dispatch(
          resumeInstance({
            conversationId,
            userRequestId: data.user_request_id,
          }),
        );
      }
    } catch (e) {
      console.error("[submit-tool-results] unexpected error", e);
    }
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a tool result for the next microtask flush. Multiple calls in the
 * same JS tick for the same conversation coalesce into one POST.
 *
 * Returns a thunk so callers can `dispatch(submitToolResult({...}))`.
 */
export const submitToolResult = (
  pending: PendingToolResult,
): ThunkAction<void, RootState, unknown, UnknownAction> => {
  return (dispatch) => {
    const { conversationId, ...rest } = pending;
    const bucket = queue.get(conversationId) ?? [];
    bucket.push(rest);
    queue.set(conversationId, bucket);
    scheduleFlush(dispatch);
  };
};

/**
 * Force an immediate synchronous flush (used by tests and by
 * `destroyInstance` to drain pending results before tear-down).
 */
export const flushToolResults = (): ThunkAction<
  void,
  RootState,
  unknown,
  UnknownAction
> => {
  return (dispatch) => {
    flushQueue(dispatch);
  };
};

/** Test helper — inspect the queue without dispatching. */
export function __getPendingQueueForTests(): ReadonlyMap<
  string,
  readonly ClientToolResult[]
> {
  return queue;
}
