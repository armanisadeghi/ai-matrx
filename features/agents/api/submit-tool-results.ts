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
import { toast } from "sonner";
import type { ThunkAction, ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

type ToolResultsDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;
import type { components } from "@/types/python-generated/api-types";
import { setInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.slice";

type ClientToolResult = components["schemas"]["ClientToolResult"];
type ToolResultsResponse = components["schemas"]["ToolResultsResponse"];

export interface PendingToolResult extends ClientToolResult {
  conversationId: string;
}

// Retry policy for transient failures (network, 5xx). Tool answers MUST NOT
// be silently lost; the user already typed/clicked the response and expects
// the agent to continue. Exponential backoff capped at ~3 attempts (1s, 3s,
// 8s) keeps us well under the user's patience window for a stuck spinner.
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decide whether a callApi error is retryable. Network failures and 5xx
 * server errors are transient — every other error code is a contract
 * violation (4xx) that retrying won't fix.
 */
function isRetryableError(err: { status?: number; type?: string }): boolean {
  if (err.type === "network_error") return true;
  if (typeof err.status === "number" && err.status >= 500 && err.status < 600) {
    return true;
  }
  return false;
}

function postToolResults(
  conversationId: string,
  results: ClientToolResult[],
): ThunkAction<Promise<void>, RootState, unknown, UnknownAction> {
  return async (dispatch, getState) => {
    const callIds = results.map((r) => r.call_id).join(", ");

    // Retry loop for transient failures (network, 5xx). The user already
    // answered — losing the result on a flaky network is the worst class
    // of bug we can ship. 4xx errors (including 404 not_found) bail out
    // immediately; they are not retryable. Errors on the FINAL attempt are
    // surfaced to the user so they can decide whether to retry manually.
    let lastError: { type?: string; status?: number; message?: string } | null =
      null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          lastError = result.error;
          if (result.error.status === 404) {
            // Duplicate or expired call_id(s). Stream remains alive — log only.
            // The doc contract says 404 ⟺ EVERY call_id was unknown; partial
            // success returns 200 with `not_found` populated. We do not retry
            // and we do not surface to the user (the stream is alive and will
            // either continue or land its own error).
            console.warn(
              "[submit-tool-results] 404 not_found — call_id(s) already resolved or expired",
              { callIds, error: result.error },
            );
            return;
          }

          if (isRetryableError(result.error) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * Math.pow(2, attempt);
            console.warn(
              `[submit-tool-results] transient failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — retrying in ${delay}ms`,
              { callIds, error: result.error },
            );
            await sleep(delay);
            continue;
          }

          // Non-retryable, or out of retries. Surface to the user — the agent
          // is silently stuck without this signal. Reset the instance to
          // `error` so the chat UI shows a recoverable state instead of an
          // endless "thinking" spinner.
          console.error(
            "[submit-tool-results] POST failed (terminal)",
            { callIds, error: result.error },
          );
          toast.error("Couldn't send tool answer", {
            description:
              result.error.message ??
              "The server rejected the tool result. The conversation may be stuck — please retry.",
          });
          dispatch(setInstanceStatus({ conversationId, status: "error" }));
          await failLifecycleForCalls(
            dispatch,
            getState,
            conversationId,
            results,
            "submit_failed",
            result.error.message ?? "tool_results POST failed",
          );
          return;
        }

        // Continuation handshake. Delegation ALWAYS hard-suspends the loop and
        // ends the stream (there is no live in-memory continuation path on the
        // server — that was removed in the Phase 1 delegation rewrite). When the
        // last outstanding client-delegated call for the user_request clears,
        // the server flags `continuation_needed=true` and returns the owning
        // `user_request_id`; we reopen the agent loop against the resume
        // endpoint — see features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
        //
        // `continuation_needed=false` here means OTHER delegated calls in the
        // same turn are still outstanding (a partial answer in a parallel
        // multi-tool turn), or this was a duplicate POST — either way we do
        // nothing and let the eventual final answer trigger the resume.
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
        return;
      } catch (e) {
        // Unexpected exception path — treat as a transient client error and
        // retry. The error surface on the final attempt is the same as the
        // result.error branch above.
        lastError = {
          type: "unknown",
          message: e instanceof Error ? e.message : String(e),
        };
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt);
          console.warn(
            `[submit-tool-results] threw (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — retrying in ${delay}ms`,
            { callIds, error: e },
          );
          await sleep(delay);
          continue;
        }
        console.error("[submit-tool-results] unexpected error (terminal)", {
          callIds,
          error: e,
        });
        toast.error("Couldn't send tool answer", {
          description:
            "The connection failed while sending the tool result. The conversation may be stuck — please retry.",
        });
        dispatch(setInstanceStatus({ conversationId, status: "error" }));
        await failLifecycleForCalls(
          dispatch,
          getState,
          conversationId,
          results,
          "submit_threw",
          lastError.message ?? "tool_results POST threw",
        );
        return;
      }
    }
  };
}

/**
 * Mark every callId we just failed to submit as `error` on the active
 * request's `toolLifecycle`. Without this the LiveToolCallCard never
 * transitions out of `started` → user sees a permanent shimmer.
 *
 * Dynamic import to avoid a static cycle with active-requests.slice (which
 * imports types that ultimately depend on this module for its dispatch
 * signature).
 */
async function failLifecycleForCalls(
  dispatch: ToolResultsDispatch,
  getState: () => RootState,
  conversationId: string,
  results: ClientToolResult[],
  errorType: string,
  errorMessage: string,
): Promise<void> {
  try {
    const { upsertToolLifecycle } = await import(
      "@/features/agents/redux/execution-system/active-requests/active-requests.slice"
    );
    // Walk every active request for this conversation and force-terminal any
    // matching callId. The reducer is idempotent + already filters on
    // completed/error.
    const state = getState();
    const activeRequests = state.activeRequests?.byRequestId ?? {};
    for (const [requestId, req] of Object.entries(activeRequests)) {
      if (req.conversationId !== conversationId) continue;
      for (const r of results) {
        const lifecycle = req.toolLifecycle?.[r.call_id];
        if (!lifecycle) continue;
        if (lifecycle.status === "completed" || lifecycle.status === "error") {
          continue;
        }
        dispatch(
          upsertToolLifecycle({
            requestId,
            callId: r.call_id,
            toolName: r.tool_name,
            status: "error",
            isDelegated: true,
            errorType,
            errorMessage,
          }),
        );
      }
    }
  } catch (e) {
    // The lifecycle update is best-effort — if the slice can't be loaded
    // (test env, etc.) we've still surfaced the toast + error status.
    console.error("[submit-tool-results] failLifecycleForCalls failed", e);
  }
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
