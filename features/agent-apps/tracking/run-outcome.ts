/**
 * THE RUN'S REAL OUTCOME — for the app's execution record and its screen.
 *
 * An app run used to be recorded `success = true` whenever `submit()`
 * resolved, and it resolves even when the server REFUSED the run: a guest's
 * refused run failed on screen and was logged a success in `app.execution`
 * (coordinator, 2026-09-27, 13:28). The outcome is the request's terminal
 * state: `complete` is a success; `error` / `timeout` is a failure with the
 * reason from `request.error` (`ErrorPayload` — requests
 * have no `errorMessage`; that field belongs to tool calls).
 */

import type { RootState } from "@/lib/redux/store";

interface RequestLike {
  status?: string;
  error?: { error_type?: string; user_message?: string; message?: string } | null;
}

export type RunOutcome =
  | { kind: "success" }
  | {
      kind: "failure";
      errorType: string;
      /** What the person reads — the server's `user_message` first. */
      message: string;
      /** The technical text (`error.message`) when it differs — kept as detail. */
      detail?: string;
    }
  | { kind: "pending" }
  /** The person stopped it — recorded as unfinished, never as a failure. */
  | { kind: "cancelled" };

/** The reason a person reads for a failed run, or null when it did not fail. */
export function requestFailure(request: RequestLike | undefined): string | null {
  if (!request) return null;
  const failed = request.status === "error" || request.status === "timeout";
  const text =
    request.error?.user_message?.trim() || request.error?.message?.trim() || "";
  if (text) return text;
  return failed ? "This run could not finish. Try again in a moment." : null;
}

export function runOutcome(request: RequestLike | undefined): RunOutcome {
  if (!request) return { kind: "pending" };
  // A request that ENDED carrying an error payload was refused, whatever its
  // status says — never a success.
  if (request.status === "complete" && request.error) {
    return {
      kind: "failure",
      errorType: request.error.error_type || "refused",
      message: requestFailure(request) ?? "This run was refused.",
      ...(request.error?.message?.trim() &&
      request.error.message.trim() !== (requestFailure(request) ?? "")
        ? { detail: request.error.message.trim() }
        : {}),
    };
  }
  if (request.status === "complete") return { kind: "success" };
  // A cancelled run is the person stopping it: the record stays unfinished
  // (success = NULL), the tracker's own abort rule — never a failure.
  if (request.status === "cancelled") return { kind: "cancelled" };
  if (request.status === "error" || request.status === "timeout") {
    return {
      kind: "failure",
      errorType: request.error?.error_type || request.status,
      message: requestFailure(request) ?? "This run could not finish.",
      ...(request.error?.message?.trim() &&
      request.error.message.trim() !== (requestFailure(request) ?? "")
        ? { detail: request.error.message.trim() }
        : {}),
    };
  }
  return { kind: "pending" };
}

interface StoreLike {
  getState: () => RootState;
  subscribe: (listener: () => void) => () => void;
}

/** Request ids already on the conversation — taken BEFORE a submit. */
export function requestIdsOf(state: RootState, conversationId: string): string[] {
  return [...(state.activeRequests?.byConversationId?.[conversationId] ?? [])];
}

/**
 * Resolve with the outcome of the FIRST request created on `conversationId`
 * after `before` was taken, once it reaches a terminal state. Resolves
 * `pending` for a cancelled run and after `timeoutMs` (the record then stays unfinished — honest,
 * never a guessed success).
 */
export function waitForRunOutcome(
  store: StoreLike,
  conversationId: string,
  before: readonly string[],
  timeoutMs = 10 * 60_000,
): Promise<RunOutcome> {
  const known = new Set(before);
  const read = (): RunOutcome => {
    const state = store.getState();
    const ids = state.activeRequests?.byConversationId?.[conversationId] ?? [];
    const id = ids.find((candidate) => !known.has(candidate));
    if (!id) return { kind: "pending" };
    const request = state.activeRequests.byRequestId[id] as RequestLike | undefined;
    if (request?.status === "cancelled") return { kind: "cancelled" };
    return runOutcome(request);
  };
  return new Promise((resolve) => {
    const first = read();
    if (first.kind !== "pending") {
      resolve(first);
      return;
    }
    let unsubscribe: () => void = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      resolve({ kind: "pending" });
    }, timeoutMs);
    unsubscribe = store.subscribe(() => {
      const outcome = read();
      if (outcome.kind === "pending") return;
      clearTimeout(timer);
      unsubscribe();
      resolve(outcome);
    });
  });
}

interface RunTrackerLike {
  settle: (outcome: RunOutcome) => void;
}

/** Write the outcome onto the app's run record (see `RunTracker.settle`). */
export function recordRunOutcome(tracker: RunTrackerLike, outcome: RunOutcome): void {
  tracker.settle(outcome);
}
