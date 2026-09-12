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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 AN UNDELIVERED TOOL ANSWER IS NEVER ABANDONED (2026-09-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE INCIDENT. A Masterwork Conductor called the delegated `apply_surface_write`
 * from a plain `/chat/<id>` tab where no mounted surface could apply it. Every
 * dispatcher in the delegated family already answers that honestly — the client
 * built the right `is_error` result. The POST carrying it failed, and this
 * module's old behaviour was to give up: toast, flip the instance to `error`,
 * DISCARD the answer. The durable `cx_tool_call` row stayed `delegated`, the
 * hard-suspended server loop kept waiting, and the user watched a dead screen
 * for six minutes. Nothing retried until the page was reloaded and the
 * cold-resume path happened to re-run the whole tool.
 *
 * TWO ROOT CAUSES, BOTH CLASS-WIDE, BOTH FIXED HERE:
 *
 * 1. THE ORGANIZATION WAS NEVER PINNED TO THE CONVERSATION. `callApi` is
 *    fail-closed on organization context: with no globally-selected organization
 *    it throws `organization_context_required` BEFORE the request leaves the
 *    browser — which is why a failure like this leaves no server-side record at
 *    all. A conversation opened in a fresh tab — exactly what the agent's own
 *    "open the full conversation in a new tab" link does — can reach this code
 *    before the selection hydrates. The sibling READ path
 *    (`fetch-pending-calls.ts`) was already fixed to pin
 *    `conversations.byConversationId[id].organizationId` through
 *    `scopeOverrides`; the WRITE path — the one that unwedges the loop — was
 *    not. It is now. Same conversation, same organization, both directions.
 *
 * 2. A NON-RETRYABLE FAILURE DISCARDED THE ANSWER. Exactly ONE outcome is
 *    honestly terminal: 404, meaning the server no longer knows the call
 *    (already resolved, or expired). Everything else — a pre-flight context
 *    error, a 4xx, a dropped socket, an exhausted burst of retries — leaves a
 *    real server-side loop suspended on an answer this client is holding. So
 *    the answer now goes into an OUTBOX and keeps being re-sent for as long as
 *    this tab lives. The user is told once, with the remedy, and the lifecycle
 *    entry says the answer is undelivered and still being retried rather than
 *    pretending the tool failed.
 */

import { callApi } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";
import { formatDurationMs } from "@ai-matrx/kit/format";
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

// Outbox cadence for an answer the fast path could not deliver. Slow on
// purpose: the fast path already spent ~7s of exponential backoff, so this is
// the "keep knocking until the tab closes" lane, not a hot loop. One POST per
// conversation per interval, carrying every answer still undelivered for it.
const OUTBOX_INTERVAL_MS = 20_000;

// ── Module-level queue + scheduling ──────────────────────────────────────────

const queue: Map<string, ClientToolResult[]> = new Map();
let scheduled = false;

// ── The outbox: answers this client holds that the server has not accepted ───
//
// Keyed by conversation, de-duplicated by call_id (a later answer for the same
// call supersedes an earlier one — the dispatchers never answer a call twice,
// but a cold-resume re-run legitimately can).
const outbox: Map<string, Map<string, ClientToolResult>> = new Map();
const outboxTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
// One toast per conversation, not one per retry.
const outboxAnnounced = new Set<string>();

function holdInOutbox(
  dispatch: ToolResultsDispatch,
  conversationId: string,
  results: ClientToolResult[],
): void {
  const held = outbox.get(conversationId) ?? new Map<string, ClientToolResult>();
  for (const result of results) held.set(result.call_id, result);
  outbox.set(conversationId, held);
  scheduleOutboxDrain(dispatch, conversationId);
}

function releaseFromOutbox(conversationId: string, callIds: string[]): void {
  const held = outbox.get(conversationId);
  if (!held) return;
  for (const callId of callIds) held.delete(callId);
  if (held.size === 0) {
    outbox.delete(conversationId);
    outboxAnnounced.delete(conversationId);
    const timer = outboxTimers.get(conversationId);
    if (timer) clearTimeout(timer);
    outboxTimers.delete(conversationId);
  }
}

function scheduleOutboxDrain(
  dispatch: ToolResultsDispatch,
  conversationId: string,
): void {
  if (outboxTimers.has(conversationId)) return;
  const timer = setTimeout(() => {
    outboxTimers.delete(conversationId);
    const held = outbox.get(conversationId);
    if (!held || held.size === 0) return;
    void dispatch(postToolResults(conversationId, Array.from(held.values())));
  }, OUTBOX_INTERVAL_MS);
  // Never hold a Node test process (or a jsdom teardown) open for this.
  (timer as unknown as { unref?: () => void }).unref?.();
  outboxTimers.set(conversationId, timer);
}

/**
 * Re-send every answer this client is still holding for a conversation, right
 * now — the manual twin of the outbox timer. Call it when something changed
 * that plausibly unblocks delivery (the conversation was (re)opened, the
 * organization context finished hydrating, the tab came back online).
 */
export const flushUndeliveredToolResults = (
  conversationId: string,
): ThunkAction<void, RootState, unknown, UnknownAction> => {
  return (dispatch) => {
    const held = outbox.get(conversationId);
    if (!held || held.size === 0) return;
    const timer = outboxTimers.get(conversationId);
    if (timer) clearTimeout(timer);
    outboxTimers.delete(conversationId);
    void dispatch(postToolResults(conversationId, Array.from(held.values())));
  };
};

/** Test helper — inspect the outbox without dispatching. */
export function __getOutboxForTests(): ReadonlyMap<
  string,
  ReadonlyMap<string, ClientToolResult>
> {
  return outbox;
}

/** Test helper — drop all held answers and timers between cases. */
export function __resetOutboxForTests(): void {
  for (const timer of outboxTimers.values()) clearTimeout(timer);
  outboxTimers.clear();
  outbox.clear();
  outboxAnnounced.clear();
  queue.clear();
  scheduled = false;
}

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

    // THE ORGANIZATION IS THE CONVERSATION'S, NOT THE TAB'S. `callApi` is
    // fail-closed: with no organization it throws before the request leaves
    // the browser. A conversation opened in a fresh tab can reach here before
    // the global selection hydrates, and the answer that unwedges a suspended
    // server loop must not depend on that race. The sibling read path
    // (`fetch-pending-calls.ts`) pins the same value the same way.
    const conversationOrganizationId =
      getState().conversations?.byConversationId?.[conversationId]
        ?.organizationId ?? undefined;

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
            scopeOverrides: conversationOrganizationId
              ? { organization_id: conversationOrganizationId }
              : undefined,
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
            // The ONE honestly-terminal outcome: the server no longer knows
            // these calls, so holding the answers would be knocking on a door
            // that is gone. Stop holding them.
            releaseFromOutbox(
              conversationId,
              results.map((r) => r.call_id),
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

          // The fast path is out of attempts. NOT terminal: a real server-side
          // loop is suspended on an answer this client is holding, so the
          // answer goes to the outbox and keeps being re-sent.
          console.error(
            "[submit-tool-results] POST failed — answer held in the outbox and will keep retrying",
            { callIds, error: result.error },
          );
          holdUndelivered(
            dispatch,
            getState,
            conversationId,
            results,
            result.error.message ?? "tool_results POST failed",
          );
          return;
        }

        // Delivered. Anything this POST carried is no longer ours to hold.
        releaseFromOutbox(
          conversationId,
          results.map((r) => r.call_id),
        );

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
        console.error(
          "[submit-tool-results] threw — answer held in the outbox and will keep retrying",
          { callIds, error: e },
        );
        holdUndelivered(
          dispatch,
          getState,
          conversationId,
          results,
          lastError.message ?? "tool_results POST threw",
        );
        return;
      }
    }
  };
}

/**
 * The fast path could not deliver these answers. Hold them, keep re-sending
 * them, and tell the truth about the state everything is really in:
 *
 *  - the answers stay in the outbox (the server loop is still waiting on them);
 *  - the instance goes to `error` so the chat stops pretending to think;
 *  - the lifecycle entries say the answer is undelivered and still being
 *    retried — never that the tool failed, which it did not;
 *  - the user is told once per conversation, with the remedy.
 */
function holdUndelivered(
  dispatch: ToolResultsDispatch,
  getState: () => RootState,
  conversationId: string,
  results: ClientToolResult[],
  reason: string,
): void {
  holdInOutbox(dispatch, conversationId, results);

  if (!outboxAnnounced.has(conversationId)) {
    outboxAnnounced.add(conversationId);
    toast.error("The agent's tool answer hasn't reached the server yet", {
      description:
        `${reason} — the answer is saved here and is being re-sent every ` +
        `${formatDurationMs(OUTBOX_INTERVAL_MS, { style: "compact" })}. Keep this tab open; ` +
        "reloading the page also re-delivers it.",
    });
  }

  dispatch(setInstanceStatus({ conversationId, status: "error" }));
  void failLifecycleForCalls(
    dispatch,
    getState,
    conversationId,
    results,
    "submit_undelivered",
    `The answer could not be delivered yet (${reason}). It is held and being re-sent.`,
  );
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
