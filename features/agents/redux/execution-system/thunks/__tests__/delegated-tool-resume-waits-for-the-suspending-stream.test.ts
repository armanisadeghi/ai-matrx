/**
 * A delegated-tool resume waits for the suspending stream — never a silent stall.
 *
 * Break this guards (2026-10-01, /files page agent, conversation 408ed1d2…):
 * the agent called the page tool `apply_surface_write`; the client ran it and
 * POSTed /tool_results while the server was still finishing the suspended turn
 * (kind-record store, completion, `end`) on the ORIGINAL stream. The server
 * answered `continuation_needed`, so `resumeInstance` ran while that stream's
 * reader was still registered. It re-polled on a fixed ~5s budget, gave up
 * before the stream closed, set the instance `paused` and claimed the
 * "reconnect UI" would recover it — but nothing stamped that UI. No answer, no
 * banner, no retry: the tool card sat there forever.
 *
 * Drives the REAL thunk against the REAL abort registry and conversation slice.
 * The only stand-in is the suspending stream itself: a registered
 * AbortController that we unregister when the "stream" closes.
 */
import {
  configureStore,
  type Middleware,
  type UnknownAction,
} from "@reduxjs/toolkit";
import conversations, {
  createInstance,
} from "../../conversations/conversations.slice";
import {
  registerAbortController,
  unregisterAbortController,
} from "../abort-registry";
import { resumeInstance } from "../resume-instance.thunk";
import { onResumeStreamOpened } from "../resume-claims";

const CONVERSATION = "408ed1d2-5a70-478c-92c8-13ad94b91412";
const USER_REQUEST = "8c295111-5fe7-4a14-84f9-27fbc45bf80f";

function makeStore() {
  const settled: UnknownAction[] = [];
  const recordSettled: Middleware = () => (next) => (action) => {
    const a = action as UnknownAction;
    if (
      a.type === resumeInstance.rejected.type ||
      a.type === resumeInstance.fulfilled.type
    ) {
      settled.push(a);
    }
    return next(action);
  };
  const store = configureStore({
    reducer: { conversations },
    middleware: (d) =>
      d({ serializableCheck: false, immutableCheck: false }).concat(
        recordSettled,
      ),
  });
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION,
      agentId: "b6856700-042b-4d91-8660-1604438d1bd2",
      agentType: "user",
      origin: "manual",
      status: "paused",
    }),
  );
  return { store, settled };
}

const payloads = (settled: UnknownAction[]) =>
  settled.map((a) => String((a as { payload?: unknown }).payload ?? ""));

describe("delegated-tool resume while the suspending stream is still closing", () => {
  let suspendingStream: AbortController;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    suspendingStream = new AbortController();
    registerAbortController(CONVERSATION, suspendingStream);
  });
  afterEach(() => {
    unregisterAbortController(CONVERSATION);
    onResumeStreamOpened(USER_REQUEST); // reset per-request counters
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("continues the turn once the stream closes, even when the close takes longer than a few seconds", async () => {
    const { store, settled } = makeStore();
    void store.dispatch(
      resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST }),
    );

    // The server is still storing the suspended turn's records and sending
    // completion + end on the original stream. 8 s is well inside a healthy
    // server's close (the client's own post-terminal guard allows 30 s).
    await jest.advanceTimersByTimeAsync(8_000);
    expect(payloads(settled)).not.toContain(
      "suspending stream still closing — retries exhausted",
    );

    // The suspending stream closes.
    unregisterAbortController(CONVERSATION, suspendingStream);
    await jest.advanceTimersByTimeAsync(1_000);

    // A resume attempt got PAST the stream-closing gate (it then fails later
    // for test-environment reasons — no org/backend — which is not this guard).
    const passedGate = payloads(settled).some(
      (p) => !p.includes("suspending stream still closing"),
    );
    expect(passedGate).toBe(true);
    expect(payloads(settled)).not.toContain(
      "suspending stream still closing — retries exhausted",
    );
  });

  it("when the stream truly never closes, the person sees a Continue affordance — never a silent stall", async () => {
    const { store, settled } = makeStore();
    void store.dispatch(
      resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST }),
    );

    await jest.advanceTimersByTimeAsync(5 * 60_000);

    expect(payloads(settled)).toContain(
      "suspending stream still closing — retries exhausted",
    );
    const record = store.getState().conversations.byConversationId[CONVERSATION];
    expect(record.status).toBe("paused");
    // The banner's "Continue agent" face: waiting, a request to continue, and
    // an explicit needs-action state.
    expect(record.serverOperation).toMatchObject({
      userRequestId: USER_REQUEST,
      status: "waiting_input",
      waitingInput: true,
      recoveryState: "needs_action",
    });
  });
});
