/**
 * A REFUSED RUN IS NEVER RECORDED AS A SUCCESS (coordinator, 2026-09-27).
 *
 * A guest's "Lightning" run at 13:28 failed on screen and was written to
 * app.execution as success = true: the shell called `tracker.complete()`
 * whenever `submit()` resolved, and it resolves when the server refuses.
 * These pin the outcome to the request's terminal state and its
 * `request.error` (there is no `errorMessage` on a request).
 */
import type { RootState } from "@/lib/redux/store";
import {
  recordRunOutcome,
  runOutcome,
  waitForRunOutcome,
} from "./run-outcome";

/** The real tracker's settle semantics, observed through what it posts. */
function tracker() {
  const complete = jest.fn();
  const error = jest.fn();
  return {
    complete,
    error,
    settle: (o: Parameters<typeof recordRunOutcome>[1]) => {
      if (o.kind === "success") complete();
      else if (o.kind === "failure") error({ errorType: o.errorType, errorMessage: o.message });
    },
  };
}

it("a refused request is a failure with the server's reason", () => {
  const outcome = runOutcome({
    status: "error",
    error: { error_type: "guest_limit", message: "tech", user_message: "Sign in to keep going." },
  });
  const t = tracker();
  recordRunOutcome(t, outcome);
  expect(t.complete).not.toHaveBeenCalled();
  expect(t.error).toHaveBeenCalledWith({ errorType: "guest_limit", errorMessage: "Sign in to keep going." });
});

it("only a completed request is a success; cancelled and unresolved record nothing", () => {
  for (const [status, completes] of [["complete", 1], ["cancelled", 0], ["streaming", 0]] as const) {
    const t = tracker();
    recordRunOutcome(t, runOutcome({ status }));
    expect(t.complete).toHaveBeenCalledTimes(completes);
    expect(t.error).not.toHaveBeenCalled();
  }
});

it("waits for THIS run's request (not an older one) to end", async () => {
  let state = {
    activeRequests: {
      byConversationId: { c1: ["old"] },
      byRequestId: { old: { status: "complete" } },
    },
  } as unknown as RootState;
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const pending = waitForRunOutcome(store, "c1", ["old"], 5_000);
  state = {
    activeRequests: {
      byConversationId: { c1: ["old", "new"] },
      byRequestId: {
        old: { status: "complete" },
        new: { status: "error", error: { error_type: "refused", message: "Not allowed" } },
      },
    },
  } as unknown as RootState;
  listeners.forEach((l) => l());
  await expect(pending).resolves.toEqual({ kind: "failure", errorType: "refused", message: "Not allowed" });
});

it("a request that completed carrying a refusal payload is a failure, not a success", () => {
  const t = tracker();
  recordRunOutcome(
    t,
    runOutcome({
      status: "complete",
      error: { error_type: "guest_limit_reached", message: "limit", user_message: "You've used your free runs." },
    }),
  );
  expect(t.complete).not.toHaveBeenCalled();
  expect(t.error).toHaveBeenCalledWith({
    errorType: "guest_limit_reached",
    errorMessage: "You've used your free runs.",
  });
});

it("a refusal records the server's friendly words as the reason and the HTTP text as the detail", () => {
  const outcome = runOutcome({
    status: "error",
    error: {
      error_type: "client_error",
      message: "API error: Guest run limit reached",
      user_message: "You've used your free runs. Sign up to keep going.",
    },
  });
  expect(outcome).toEqual({
    kind: "failure",
    errorType: "client_error",
    message: "You've used your free runs. Sign up to keep going.",
    detail: "API error: Guest run limit reached",
  });
});

it("a page leaving (reload) is known, so its dying fetch is not recorded as a failed run", async () => {
  const { isPageLeaving } = await import("./run-outcome");
  expect(isPageLeaving()).toBe(false);
  window.dispatchEvent(new Event("pagehide"));
  expect(isPageLeaving()).toBe(true);
  window.dispatchEvent(new Event("pageshow"));
  expect(isPageLeaving()).toBe(false);
});
