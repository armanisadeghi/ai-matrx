import type { UnknownAction } from "@reduxjs/toolkit";
import type { ThunkAction } from "redux-thunk";
import { toast } from "@/lib/toast";

import { fetchConversationPendingCallsStrict } from "@/features/agents/api/fetch-pending-calls";
import type { RootState } from "@/lib/redux/store";
import { hasAbortController } from "./abort-registry";
import { loadConversation } from "./load-conversation.thunk";
import { resumeInstance } from "./resume-instance.thunk";
import { reconcilePersistedToolLifecycle } from "../active-requests/active-requests.slice";

/**
 * 🚨 THE CADENCE IS A SCHEDULE, NOT A CONSTANT (measured 2026-09-21).
 *
 * This loop used a flat 750 ms `sleep` with no ceiling and no terminal
 * condition. That is right for the first seconds of a LIVE delegation — the
 * desktop normally claims and answers a `local_*` call in about a second — and
 * indefensible afterwards. A call the desktop never claims stays `delegated`
 * in `cx_tool_call` forever, so on every subsequent load `surfaceColdPendingCalls`
 * re-surfaced it and started this loop again, permanently.
 *
 * Measured on an idle `/staff` (localhost dev, admin@admin.com) carrying three
 * such stale calls: 192 GETs per minute to production aidream's
 * `/ai/conversation/{id}/pending_calls`, for a page nobody was touching — and
 * `/chat/<the same conversation>` measured 112/min, which is how we know this
 * is the SHARED chat surface's cost and not something `/staff` adds.
 *
 * So: fast while something is plausibly about to happen, decayed to a ceiling
 * once it plainly is not, and quickened again the moment the ledger changes.
 */
const POLL_MS = 750;
/** Where a call nobody is going to claim settles. */
const MAX_POLL_MS = 15_000;
/** How long a live delegation holds the fast cadence before it decays. */
const FAST_WINDOW_MS = 30_000;
const BACKOFF_FACTOR = 1.5;
const FAILURE_NOTICE_THRESHOLD = 8;
const RESUME_RETRY_MS = 5_000;

interface WatchState {
  callIdsByLifecycle: Map<string, Set<string>>;
  cancelled: boolean;
  promise: Promise<void>;
}

const watches = new Map<string, WatchState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watchKey(conversationId: string, userRequestId: string): string {
  return `${conversationId}:${userRequestId}`;
}

function addLifecycleCall(
  state: WatchState,
  lifecycleRequestId: string,
  callId: string,
): void {
  const callIds = state.callIdsByLifecycle.get(lifecycleRequestId) ?? new Set();
  callIds.add(callId);
  state.callIdsByLifecycle.set(lifecycleRequestId, callIds);
}

function allCallIds(state: WatchState): string[] {
  return Array.from(
    new Set(
      Array.from(state.callIdsByLifecycle.values()).flatMap((callIds) =>
        Array.from(callIds),
      ),
    ),
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asServerUserRequestId(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value) ? value : undefined;
}

export interface WatchDesktopDelegationArgs {
  conversationId: string;
  /** Redux execution key (`req_...`) used only for visible lifecycle state. */
  lifecycleRequestId: string;
  /** Persisted chat.user_request UUID. Never substitute the Redux request key. */
  userRequestId?: string;
  callId: string;
  /**
   * TRUE when this call was replayed from the persisted ledger rather than
   * delivered by a live `tool_delegated` event. Nothing is imminent for such a
   * call — it has been sitting `delegated` since some earlier session — so the
   * watch opens at `MAX_POLL_MS` instead of paying the fast cadence for a
   * desktop that already had its chance to claim it.
   */
  coldResume?: boolean;
}

/**
 * Reconcile a browser-visible desktop delegation from aidream's authenticated
 * durable ledger. Matrx Local gives this watcher a short first-claim window;
 * if this tab is gone or throttled, the desktop resumes headlessly instead.
 */
export const watchDesktopDelegation = (
  args: WatchDesktopDelegationArgs,
): ThunkAction<Promise<void>, RootState, unknown, UnknownAction> => {
  return (dispatch, getState) => {
    const { conversationId, lifecycleRequestId, callId } = args;
    let userRequestId = asServerUserRequestId(args.userRequestId);
    if (args.userRequestId && !userRequestId) {
      console.error("[desktop-native] ignored invalid server user_request_id", {
        conversationId,
        callId,
        userRequestId: args.userRequestId,
      });
    }
    let key = watchKey(conversationId, userRequestId ?? lifecycleRequestId);
    const existing = watches.get(key);
    if (existing) {
      addLifecycleCall(existing, lifecycleRequestId, callId);
      return existing.promise;
    }

    const state: WatchState = {
      callIdsByLifecycle: new Map(),
      cancelled: false,
      promise: Promise.resolve(),
    };
    addLifecycleCall(state, lifecycleRequestId, callId);
    state.promise = (async () => {
      let hydratedAfterResolution = false;
      let consecutiveFailures = 0;
      let failureNotified = false;
      let nextResumeAt = 0;
      let nextFallbackHydrateAt = 0;

      // ── The cadence (see the constants above) ──────────────────────────────
      const coldResume = args.coldResume === true;
      let pollMs = coldResume ? MAX_POLL_MS : POLL_MS;
      let fastUntil = coldResume ? 0 : Date.now() + FAST_WINDOW_MS;
      /** null until the first read, so arriving rows never read as a change. */
      let lastLedgerSignature: string | null = null;

      /** Nothing is happening. Cost less, up to the ceiling. */
      const decay = () => {
        if (Date.now() < fastUntil) {
          pollMs = POLL_MS;
          return;
        }
        pollMs = Math.min(MAX_POLL_MS, Math.round(pollMs * BACKOFF_FACTOR));
      };
      /** The ledger moved. Watch closely again — this is when latency matters. */
      const quicken = () => {
        fastUntil = Date.now() + FAST_WINDOW_MS;
        pollMs = POLL_MS;
      };

      const adoptUserRequestId = (candidate: string | undefined): boolean => {
        const recovered = asServerUserRequestId(candidate);
        if (!recovered) return true;
        userRequestId = recovered;

        const recoveredKey = watchKey(conversationId, recovered);
        if (recoveredKey === key) return true;

        const competing = watches.get(recoveredKey);
        if (competing && competing !== state) {
          for (const [requestId, delegatedCallIds] of state.callIdsByLifecycle) {
            for (const delegatedCallId of delegatedCallIds) {
              addLifecycleCall(competing, requestId, delegatedCallId);
            }
          }
          state.cancelled = true;
          return false;
        }

        if (watches.get(key) === state) watches.delete(key);
        key = recoveredKey;
        watches.set(key, state);
        return true;
      };

      const recordFailure = (message: string, error: unknown) => {
        consecutiveFailures += 1;
        console.warn(message, { conversationId, userRequestId, error });
        if (
          consecutiveFailures >= FAILURE_NOTICE_THRESHOLD &&
          !failureNotified
        ) {
          failureNotified = true;
          toast.error("Desktop tool status is unavailable", {
            description:
              "The chat is still retrying its connection to the server. Your local tool result has not been discarded.",
          });
        }
      };

      const recordSuccess = () => {
        consecutiveFailures = 0;
      };

      const reconcileAllLifecycles = () => {
        for (const [requestId, delegatedCallIds] of state.callIdsByLifecycle) {
          dispatch(
            reconcilePersistedToolLifecycle({
              requestId,
              callIds: Array.from(delegatedCallIds),
            }),
          );
        }
      };

      const hydrateResolvedTools = async (): Promise<boolean> => {
        if (hydratedAfterResolution) return true;
        try {
          await dispatch(loadConversation({ conversationId })).unwrap();
          hydratedAfterResolution = true;
          reconcileAllLifecycles();
          recordSuccess();
          return true;
        } catch (error) {
          recordFailure("[desktop-native] resolved-tool rehydrate failed", error);
          return false;
        }
      };

      while (!state.cancelled) {
        await sleep(pollMs);
        if (state.cancelled) return;

        // Logout/conversation teardown removes the instance. Do not leave a
        // module-level poll alive after its owning Redux state is gone.
        const owningInstance =
          getState().conversations.byConversationId[conversationId];
        if (!owningInstance) return;
        if (
          owningInstance.status === "error" ||
          owningInstance.status === "cancelled"
        ) {
          return;
        }

        let pending;
        try {
          pending = await dispatch(
            fetchConversationPendingCallsStrict(conversationId),
          );
        } catch (error) {
          recordFailure(
            "[desktop-native] pending-call reconciliation failed",
            error,
          );
          // A server that is refusing must not be asked three times a second.
          decay();
          continue;
        }

        // Did the ledger move since the last tick? A row appearing, resolving,
        // or being re-delegated is the only signal that watching closely is
        // worth anything — so it, and nothing else, restores the fast cadence.
        const ledgerSignature = pending
          .map((call) => call.call_id)
          .sort()
          .join(",");
        const ledgerChanged =
          lastLedgerSignature !== null &&
          ledgerSignature !== lastLedgerSignature;
        lastLedgerSignature = ledgerSignature;
        if (ledgerChanged) quicken();
        if (!userRequestId) {
          const matchingCall = pending.find((call) =>
            allCallIds(state).includes(call.call_id),
          );
          if (
            !adoptUserRequestId(matchingCall?.user_request_id ?? undefined)
          ) {
            return;
          }
        }
        const requestPending = pending.filter((call) =>
          userRequestId
            ? call.user_request_id === userRequestId
            : allCallIds(state).includes(call.call_id),
        );
        if (requestPending.length > 0) {
          // Parallel and re-delegated calls share one request. Never hydrate or
          // resume until the server says every sibling has resolved.
          hydratedAfterResolution = false;
          nextResumeAt = 0;
          recordSuccess();
          // THE IDLE BRANCH — the one this loop spends its life in when a
          // desktop never claims the call. Every other branch below is the
          // loop actively finishing a turn, and keeps whatever cadence it has.
          if (!ledgerChanged) decay();
          continue;
        }

        // The original hard-suspend stream may still be winding down, or this
        // tab may already own the continuation. Hydration replaces transcript
        // state, so it must never run over an active stream.
        if (hasAbortController(conversationId)) continue;

        // The desktop can claim and resolve a call before our first poll. In
        // that case pending_calls no longer contains the row, so hydrate the
        // persisted observability ledger and recover the server request UUID
        // from its call-id index.
        if (!userRequestId) {
          if (Date.now() < nextFallbackHydrateAt) continue;
          if (!(await hydrateResolvedTools())) continue;
          const observability = getState().observability;
          const recovered = allCallIds(state).find((delegatedCallId) => {
            const toolCallId = observability.toolCallsByCallId[delegatedCallId];
            return toolCallId
              ? asServerUserRequestId(
                  observability.toolCalls[toolCallId]?.userRequestId ?? undefined,
                )
              : undefined;
          });
          const recoveredToolCallId = recovered
            ? observability.toolCallsByCallId[recovered]
            : undefined;
          const recoveredUserRequestId = recoveredToolCallId
            ? observability.toolCalls[recoveredToolCallId]?.userRequestId
            : undefined;
          if (!adoptUserRequestId(recoveredUserRequestId ?? undefined)) return;
          if (!userRequestId) {
            hydratedAfterResolution = false;
            nextFallbackHydrateAt = Date.now() + RESUME_RETRY_MS;
            recordFailure(
              "[desktop-native] waiting for persisted user_request_id",
              new Error(`No server request UUID is known for call ${callId}`),
            );
            continue;
          }
        }

        if (!(await hydrateResolvedTools())) continue;
        const hydratedInstance =
          getState().conversations.byConversationId[conversationId];
        if (!hydratedInstance) return;
        if (
          hydratedInstance.status === "error" ||
          hydratedInstance.status === "cancelled"
        ) {
          return;
        }
        if (hydratedInstance.status === "complete") {
          try {
            await dispatch(loadConversation({ conversationId })).unwrap();
            reconcileAllLifecycles();
            return;
          } catch (error) {
            recordFailure(
              "[desktop-native] winning continuation rehydrate failed",
              error,
            );
            continue;
          }
        }

        if (Date.now() < nextResumeAt) continue;
        try {
          await dispatch(
            resumeInstance({ conversationId, userRequestId }),
          ).unwrap();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("resume_conflict")) {
            // resumeInstance owns its bounded conflict retry schedule. Remain
            // as an observer so the winning continuation is still hydrated.
            nextResumeAt = Date.now() + RESUME_RETRY_MS;
            continue;
          }
          if (
            message.includes("already in progress") ||
            message.includes("already claimed for this user_request") ||
            message.includes("stream already in flight")
          ) {
            nextResumeAt = Date.now() + RESUME_RETRY_MS;
            continue;
          }

          const rejectedInstance =
            getState().conversations.byConversationId[conversationId];
          if (!rejectedInstance) return;
          if (
            rejectedInstance.status === "error" ||
            rejectedInstance.status === "cancelled"
          ) {
            return;
          }
          recordFailure("[desktop-native] continuation resume failed", error);
          toast.error("Desktop tool continuation failed", {
            description: message,
          });
          return;
        }
        if (state.cancelled) return;

        const instance =
          getState().conversations.byConversationId[conversationId];
        if (!instance) return;
        if (instance.status === "paused") {
          // Either a sibling/re-entrant tool is now pending or another resume
          // owner still has the server claim. Re-read the ledger; do not assume
          // a fulfilled thunk means the continuation completed.
          nextResumeAt = Date.now() + RESUME_RETRY_MS;
          continue;
        }
        if (instance.status === "error" || instance.status === "cancelled") {
          // runAiStream surfaced a visible terminal state. Do not silently spin.
          return;
        }
        if (instance.status !== "complete") continue;

        // A different tab or Matrx Local may have won the atomic claim. One
        // final authoritative read brings its completed assistant message and
        // tool rows into this tab. Retry transient hydration failures.
        try {
          await dispatch(loadConversation({ conversationId })).unwrap();
          reconcileAllLifecycles();
          return;
        } catch (error) {
          recordFailure(
            "[desktop-native] final continuation rehydrate failed",
            error,
          );
        }
      }
    })().finally(() => {
      if (watches.get(key) === state) watches.delete(key);
    });
    watches.set(key, state);
    return state.promise;
  };
};

export function __resetDesktopDelegationWatchesForTests(): void {
  for (const state of watches.values()) state.cancelled = true;
  watches.clear();
}
