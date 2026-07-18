import type { UnknownAction } from "@reduxjs/toolkit";
import type { ThunkAction } from "redux-thunk";
import { toast } from "sonner";

import { fetchConversationPendingCallsStrict } from "@/features/agents/api/fetch-pending-calls";
import type { RootState } from "@/lib/redux/store";
import { hasAbortController } from "./abort-registry";
import { loadConversation } from "./load-conversation.thunk";
import { resumeInstance } from "./resume-instance.thunk";
import { reconcilePersistedToolLifecycle } from "../active-requests/active-requests.slice";

const POLL_MS = 750;
const FAILURE_NOTICE_THRESHOLD = 8;
const RESUME_RETRY_MS = 5_000;

interface WatchState {
  callIds: Set<string>;
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
    const key = watchKey(conversationId, userRequestId ?? lifecycleRequestId);
    const existing = watches.get(key);
    if (existing) {
      existing.callIds.add(callId);
      return existing.promise;
    }

    const state: WatchState = {
      callIds: new Set([callId]),
      cancelled: false,
      promise: Promise.resolve(),
    };
    state.promise = (async () => {
      let hydratedAfterResolution = false;
      let consecutiveFailures = 0;
      let failureNotified = false;
      let nextResumeAt = 0;

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

      while (!state.cancelled) {
        await sleep(POLL_MS);
        if (state.cancelled) return;

        // Logout/conversation teardown removes the instance. Do not leave a
        // module-level poll alive after its owning Redux state is gone.
        if (!getState().conversations.byConversationId[conversationId]) return;

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
          continue;
        }
        if (!userRequestId) {
          const matchingCall = pending.find((call) =>
            state.callIds.has(call.call_id),
          );
          userRequestId = asServerUserRequestId(
            matchingCall?.user_request_id ?? undefined,
          );
        }
        const requestPending = pending.filter((call) =>
          userRequestId
            ? call.user_request_id === userRequestId
            : state.callIds.has(call.call_id),
        );
        if (requestPending.length > 0) {
          // Parallel and re-delegated calls share one request. Never hydrate or
          // resume until the server says every sibling has resolved.
          hydratedAfterResolution = false;
          nextResumeAt = 0;
          recordSuccess();
          continue;
        }

        // The original hard-suspend stream may still be winding down, or this
        // tab may already own the continuation. Hydration replaces transcript
        // state, so it must never run over an active stream.
        if (hasAbortController(conversationId)) continue;

        // The desktop can claim a call before our first poll. Without a
        // server UUID the browser must not attempt /resume; Matrx Local owns
        // the durable continuation and a later hydration will pick it up.
        if (!userRequestId) {
          recordFailure(
            "[desktop-native] waiting for persisted user_request_id",
            new Error(`No server request UUID is known for call ${callId}`),
          );
          continue;
        }

        if (!hydratedAfterResolution) {
          try {
            await dispatch(loadConversation({ conversationId })).unwrap();
            hydratedAfterResolution = true;
          } catch (error) {
            recordFailure(
              "[desktop-native] resolved-tool rehydrate failed",
              error,
            );
            continue;
          }
          dispatch(
            reconcilePersistedToolLifecycle({
              requestId: lifecycleRequestId,
              callIds: Array.from(state.callIds),
            }),
          );
          recordSuccess();
        }

        if (Date.now() < nextResumeAt) continue;
        await dispatch(resumeInstance({ conversationId, userRequestId }));
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
          dispatch(
            reconcilePersistedToolLifecycle({
              requestId: lifecycleRequestId,
              callIds: Array.from(state.callIds),
            }),
          );
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
