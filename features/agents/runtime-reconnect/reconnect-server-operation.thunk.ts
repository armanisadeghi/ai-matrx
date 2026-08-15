/**
 * reconnectServerOperation — SERVER-truth reconnect for a chat conversation,
 * on aidream's canonical `/runtime` reconnect surface (2026-08-10).
 *
 * The contract this consumes: streams run `detach_on_disconnect=True`, so a
 * page refresh or dropped connection never stops the server's work. This thunk
 * asks the runtime spine "is anything still running for this conversation?"
 * (`GET /runtime/operations/by-link/conversation/{id}` — ONE status fetch),
 * and when a non-terminal operation exists it:
 *
 *   1. Stamps `serverOperation` onto the conversation record (the persistent
 *      "still working on the server" indicator — server state, so it survives
 *      refresh; no dead ends).
 *   2. Follows the operation's SSE event stream (replay-then-follow,
 *      `Last-Event-ID` cursor) until the terminal `end` frame. No polling.
 *   3. On `waiting_input`, surfaces the pending delegated calls through the
 *      existing cold-resume path so the user can answer and resume.
 *   4. On terminal, refetches the conversation from Supabase
 *      (`loadConversation`) so the finished message appears without a manual
 *      refresh, then clears the indicator.
 *
 * Token text is deliberately NOT replayed (platform doctrine) — reconnect UX
 * is status until terminal, then a DB refetch.
 *
 * Fallback: when the spine has no operation (pre-spine turn, surface missing)
 * a stream-loss caller falls back to the legacy `recoverDroppedStream` poll so
 * behavior never regresses. Loud-recovery doctrine: every path console.warns.
 *
 * Stand-down rule: a live NDJSON stream on the conversation always owns the
 * display — the follower aborts itself the moment one exists.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { setRequestStatus } from "../redux/execution-system/active-requests/active-requests.slice";
import {
  patchConversation,
  setInstanceStatus,
} from "../redux/execution-system/conversations/conversations.slice";
import { selectLatestRequestId } from "../redux/execution-system/selectors/aggregate.selectors";
import { hasAbortController } from "../redux/execution-system/thunks/abort-registry";
import { loadConversation } from "../redux/execution-system/thunks/load-conversation.thunk";
import { recoverDroppedStream } from "../redux/execution-system/thunks/recover-dropped-stream.thunk";
import { resolveBackendForConversation } from "../redux/execution-system/thunks/resolve-base-url";
import { surfaceColdPendingCalls } from "../redux/execution-system/thunks/surface-cold-pending-calls.thunk";
import { resumeInstance } from "../redux/execution-system/thunks/resume-instance.thunk";
import { selectActivePendingAsksForConversation } from "../ui-first-tools/redux/pending-asks.slice";
import { fetchOperationsByLink, followOperationStream } from "./api";
import type {
  RuntimeExecutionStatus,
  RuntimeOperationView,
  ServerOperationState,
} from "./types";
import { decideWaitingInputRecovery } from "./waiting-input-recovery";

export interface ReconnectServerOperationArgs {
  conversationId: string;
  /**
   * "cold-load"  — page load / conversation open (one by-link status fetch).
   * "stream-loss" — the live stream's heartbeat died mid-turn.
   */
  source: "cold-load" | "stream-loss";
  /** The request whose stream died (stream-loss) — cleared on recovery. */
  requestId?: string;
}

export interface ReconnectServerOperationResult {
  followed: boolean;
  finalStatus: RuntimeExecutionStatus | null;
}

/** Spine event kinds that move the banner between running and waiting. */
const RUNNING_KINDS = new Set(["started", "resumed"]);

/**
 * One follower per conversation — a newer reconnect (or a stand-down) aborts
 * the previous one. Module-level like the stream abort-registry: this is
 * transport machinery, not renderable state.
 */
const followers = new Map<string, AbortController>();

function stopFollower(conversationId: string): void {
  followers.get(conversationId)?.abort();
  followers.delete(conversationId);
}

export const reconnectServerOperation = createAsyncThunk<
  ReconnectServerOperationResult,
  ReconnectServerOperationArgs,
  { dispatch: AppDispatch; state: RootState }
>(
  "execution/reconnectServerOperation",
  async ({ conversationId, source, requestId }, { dispatch, getState }) => {
    const noFollow: ReconnectServerOperationResult = {
      followed: false,
      finalStatus: null,
    };
    const state = getState();
    const instance = state.conversations?.byConversationId?.[conversationId];

    const fallbackToLegacyRecovery = () => {
      const rid =
        requestId ?? selectLatestRequestId(conversationId)(getState());
      if (!rid) return;
      void dispatch(recoverDroppedStream({ conversationId, requestId: rid }));
    };

    // Ephemeral conversations have no DB row to refetch — the runtime surface
    // can't complete the loop for them. Keep the legacy self-heal.
    if (instance?.isEphemeral) {
      if (source === "stream-loss") fallbackToLegacyRecovery();
      return noFollow;
    }

    // A live stream owns the wire and the display.
    if (hasAbortController(conversationId)) return noFollow;

    // No client-side "is a turn in flight?" pre-gate on cold load — it cannot
    // be answered reliably. The hydrated observability rows reach the client
    // only through committed `chat.request` rows, and a just-started turn may
    // have none yet (its user_request row is then invisible), which is exactly
    // the refresh-mid-generation case this feature exists for. The by-link
    // call below IS the gate: one cheap owner-scoped GET per cold open.

    const backend = resolveBackendForConversation(state, conversationId);
    if (!backend) {
      if (source === "stream-loss") fallbackToLegacyRecovery();
      return noFollow;
    }

    let op: RuntimeOperationView | null = null;
    try {
      const byLink = await fetchOperationsByLink(backend, conversationId);
      op = byLink?.operations.find((o) => !o.is_terminal) ?? null;
    } catch (err) {
      console.warn(
        "[runtime-reconnect] operations-by-link fetch failed — falling back to legacy recovery.",
        { conversationId, err },
      );
      if (source === "stream-loss") fallbackToLegacyRecovery();
      return noFollow;
    }

    if (!op) {
      // Nothing non-terminal on the spine. For a dropped stream that can mean
      // the settle raced our check OR the turn ran off-spine — the legacy
      // poll covers both. For a cold load it simply means nothing to show.
      if (source === "stream-loss") fallbackToLegacyRecovery();
      return noFollow;
    }

    stopFollower(conversationId);
    const ctrl = new AbortController();
    followers.set(conversationId, ctrl);

    console.warn(
      "[runtime-reconnect] non-terminal server operation found — following its event stream.",
      {
        conversationId,
        executionId: op.execution_id,
        status: op.status,
        source,
      },
    );

    const stampOperation = (
      status: RuntimeExecutionStatus,
      waitingInput: boolean,
      recoveryState?: ServerOperationState["recoveryState"],
    ) => {
      const serverOperation: ServerOperationState = {
        executionId: op.execution_id,
        userRequestId: op.request_id,
        status,
        waitingInput,
        ...(recoveryState ? { recoveryState } : {}),
        startedAt: op.started_at,
        checkedAt: new Date().toISOString(),
      };
      dispatch(patchConversation({ conversationId, serverOperation }));
    };

    let waitingRecoveryInFlight = false;
    const recoverWaitingInput = async () => {
      if (waitingRecoveryInFlight) return;
      waitingRecoveryInFlight = true;
      stampOperation("waiting_input", true, "checking_for_prompt");
      try {
        const surfaced = await dispatch(
          surfaceColdPendingCalls(conversationId, { strict: true }),
        );
        const asks =
          selectActivePendingAsksForConversation(conversationId)(getState());
        const decision = decideWaitingInputRecovery({
          pendingCallCount: surfaced,
          pendingAskCount: asks.length,
          userRequestId: op.request_id,
        });
        if (decision === "prompt_visible") {
          stampOperation("waiting_input", true, "prompt_visible");
          return;
        }
        if (decision === "pending_tool") {
          // A non-interactive client handler (or a schema-error recovery) is
          // processing the durable call now. Its tool-result POST owns resume.
          // Never race it with a speculative /resume request.
          stampOperation("waiting_input", true, "pending_tool");
          return;
        }
        if (decision === "needs_action") {
          console.error(
            "[runtime-reconnect] waiting operation has no pending prompt and no request_id; user action is required.",
            { conversationId, executionId: op.execution_id },
          );
          stampOperation("waiting_input", true, "needs_action");
          return;
        }

        const userRequestId = op.request_id;
        if (!userRequestId) {
          // Defensive narrowing for mixed-version deployments. The decision
          // above already routed this shape to needs_action.
          stampOperation("waiting_input", true, "needs_action");
          return;
        }

        // `continue`: the durable answer already landed but its client-side continuation
        // handoff was lost (refresh, crash, or the fast-tool stream-close race).
        // There is nothing for the user to answer: resume from server truth.
        console.warn(
          "[runtime-reconnect] waiting operation has zero pending calls — continuing the resolved request.",
          {
            conversationId,
            executionId: op.execution_id,
            userRequestId,
          },
        );
        stampOperation("waiting_input", true, "continuing");
        void dispatch(
          resumeInstance({
            conversationId,
            userRequestId,
          }),
        ).then((action) => {
          if (!resumeInstance.rejected.match(action)) return;
          const reason = String(action.payload ?? action.error.message ?? "");
          if (reason.includes("retry") && reason.includes("scheduled")) return;
          const current =
            getState().conversations.byConversationId[conversationId]
              ?.serverOperation;
          if (current?.executionId === op.execution_id) {
            stampOperation("waiting_input", true, "needs_action");
          }
        });
      } catch (err) {
        console.error(
          "[runtime-reconnect] pending-call recovery check failed; preserving an explicit retry affordance.",
          { conversationId, executionId: op.execution_id, err },
        );
        stampOperation("waiting_input", true, "needs_action");
      } finally {
        waitingRecoveryInFlight = false;
      }
    };

    stampOperation(
      op.status,
      op.waiting_input,
      op.waiting_input ? "checking_for_prompt" : undefined,
    );
    if (op.waiting_input) {
      void recoverWaitingInput();
    }

    const result = await followOperationStream({
      backend,
      executionId: op.execution_id,
      lastEventSeq: op.last_event_seq,
      signal: ctrl.signal,
      onEvent: (event) => {
        // A live stream started (retry / new send / delegated resume) — it
        // owns the display now; the follower stands down.
        if (hasAbortController(conversationId)) {
          ctrl.abort();
          return;
        }
        if (event.kind === "waiting_input") {
          void recoverWaitingInput();
        } else if (RUNNING_KINDS.has(event.kind)) {
          stampOperation("running", false);
        } else if (event.kind === "paused") {
          stampOperation("paused", false);
        }
      },
    });

    if (followers.get(conversationId) === ctrl) {
      followers.delete(conversationId);
    }

    if (ctrl.signal.aborted) {
      // Stood down — a live stream took over. It owns status from here.
      // A manual Check again can also replace this follower with a newer one;
      // in that case the newer follower already owns the banner and this stale
      // task must not erase its freshly-stamped recovery state.
      if (followers.has(conversationId)) return noFollow;
      dispatch(patchConversation({ conversationId, serverOperation: null }));
      return noFollow;
    }

    if (!result.ended) {
      // Every SSE attempt failed. Don't leave a claim we can't back.
      console.warn(
        "[runtime-reconnect] event stream unavailable after retries — falling back to legacy recovery.",
        { conversationId, executionId: op.execution_id },
      );
      dispatch(patchConversation({ conversationId, serverOperation: null }));
      fallbackToLegacyRecovery();
      return noFollow;
    }

    // Terminal. The feature record is the content truth — refetch it so the
    // finished message appears without a manual refresh.
    try {
      await dispatch(loadConversation({ conversationId })).unwrap();
    } catch (err) {
      console.warn(
        "[runtime-reconnect] operation settled but the conversation refetch failed.",
        { conversationId, err },
      );
      dispatch(patchConversation({ conversationId, serverOperation: null }));
      return { followed: true, finalStatus: result.status };
    }

    dispatch(patchConversation({ conversationId, serverOperation: null }));

    const finalStatus = result.status;
    if (finalStatus === "completed") {
      const rid =
        requestId ?? selectLatestRequestId(conversationId)(getState());
      if (rid)
        dispatch(setRequestStatus({ requestId: rid, status: "complete" }));
      dispatch(setInstanceStatus({ conversationId, status: "complete" }));
      if (source === "stream-loss") {
        toast.success("Connection recovered", {
          description:
            "The stream dropped mid-response, but the server finished the turn. The full response has been loaded.",
        });
      }
    } else if (finalStatus === "failed") {
      dispatch(setInstanceStatus({ conversationId, status: "error" }));
    } else if (finalStatus === "cancelled") {
      dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
    }

    console.warn("[runtime-reconnect] server operation settled — rehydrated.", {
      conversationId,
      executionId: op.execution_id,
      finalStatus,
    });
    return { followed: true, finalStatus };
  },
);
