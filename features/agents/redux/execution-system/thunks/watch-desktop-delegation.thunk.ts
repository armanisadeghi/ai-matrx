import type { UnknownAction } from "@reduxjs/toolkit";
import type { ThunkAction } from "redux-thunk";

import { fetchConversationPendingCallsStrict } from "@/features/agents/api/fetch-pending-calls";
import type { RootState } from "@/lib/redux/store";
import { hasAbortController } from "./abort-registry";
import { loadConversation } from "./load-conversation.thunk";
import { resumeInstance } from "./resume-instance.thunk";

const POLL_MS = 750;

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

export interface WatchDesktopDelegationArgs {
  conversationId: string;
  userRequestId: string;
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
    const { conversationId, userRequestId, callId } = args;
    const key = watchKey(conversationId, userRequestId);
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
          console.warn("[desktop-native] pending-call reconciliation failed", {
            conversationId,
            userRequestId,
            error,
          });
          continue;
        }

        const requestPending = pending.filter(
          (call) => call.user_request_id === userRequestId,
        );
        if (requestPending.length > 0) {
          // Parallel and re-delegated calls share one request. Never hydrate or
          // resume until the server says every sibling has resolved.
          hydratedAfterResolution = false;
          continue;
        }

        // The original hard-suspend stream may still be winding down, or this
        // tab may already own the continuation. Hydration replaces transcript
        // state, so it must never run over an active stream.
        if (hasAbortController(conversationId)) continue;

        if (!hydratedAfterResolution) {
          try {
            await dispatch(loadConversation({ conversationId })).unwrap();
            hydratedAfterResolution = true;
          } catch (error) {
            console.warn("[desktop-native] resolved-tool rehydrate failed", {
              conversationId,
              userRequestId,
              error,
            });
            continue;
          }
        }

        await dispatch(resumeInstance({ conversationId, userRequestId }));
        if (state.cancelled) return;

        const instance =
          getState().conversations.byConversationId[conversationId];
        if (!instance) return;
        if (instance.status === "paused") {
          // Either a sibling/re-entrant tool is now pending or another resume
          // owner still has the server claim. Re-read the ledger; do not assume
          // a fulfilled thunk means the continuation completed.
          hydratedAfterResolution = false;
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
          return;
        } catch (error) {
          console.warn("[desktop-native] final continuation rehydrate failed", {
            conversationId,
            userRequestId,
            error,
          });
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
