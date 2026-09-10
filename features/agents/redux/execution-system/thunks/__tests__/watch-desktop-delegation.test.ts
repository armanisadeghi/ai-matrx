/**
 * watchDesktopDelegation — reconciles a desktop-delegated call from aidream's
 * durable ledger, then hydrates and resumes exactly once.
 *
 * SUT: `watchDesktopDelegation`. It OWNS: one watcher per (conversation,
 * server user_request) with re-entrant calls folded in; never resuming while a
 * sibling call is pending; recovering the server UUID (from ledger rows or the
 * hydrated tool-call ledger) and never using the Redux lifecycle key; never
 * hydrating over this tab's live stream; retrying transient failures and
 * telling the user only after sustained ones; observing a competing resume;
 * stopping on terminal/torn-down conversations; and reconciling every
 * delegated call's lifecycle in the store when the continuation lands.
 *
 * Real: the store, every reducer the watcher reads or writes, and the
 * abort-controller registry. Replaced: only the three network seams it calls
 * — the pending-calls ledger read, the conversation bundle load (which, like
 * the real one, hydrates the observability ledger into the store), and the
 * resume stream (which, like the real one, moves the conversation status).
 * Polling is timer-driven by design, so fake timers advance the 750ms poll.
 */

import type { PendingCallSummary } from "@/features/agents/api/fetch-pending-calls";
import type { CxToolCallRecord } from "../../observability/observability.slice";
import type { InstanceStatus } from "@/features/agents/types/instance.types";

type LedgerStep = PendingCallSummary[] | Error;
type LoadStep = { fail: Error } | { toolCalls: CxToolCallRecord[] };
type ResumeStep = { reject: string } | { status: InstanceStatus };

const mockLedgerScript: LedgerStep[] = [];
const mockLoadScript: LoadStep[] = [];
const mockResumeScript: ResumeStep[] = [];
const mockCounts = { ledgerReads: 0, loads: 0 };
const mockResumes: Array<{ conversationId: string; userRequestId: string }> =
  [];
const mockToastError = jest.fn();

jest.mock("@/features/agents/api/fetch-pending-calls", () => ({
  fetchConversationPendingCallsStrict: () => async () => {
    mockCounts.ledgerReads += 1;
    const step = mockLedgerScript.shift() ?? [];
    if (step instanceof Error) throw step;
    return step;
  },
}));
jest.mock("../load-conversation.thunk", () => ({
  loadConversation:
    ({ conversationId }: { conversationId: string }) =>
    (dispatch: (action: unknown) => unknown) => {
      mockCounts.loads += 1;
      const step = mockLoadScript.shift() ?? { toolCalls: [] };
      if ("fail" in step) {
        return { unwrap: () => Promise.reject(step.fail) };
      }
      const { hydrateObservability } = jest.requireActual(
        "../../observability/observability.slice",
      );
      dispatch(
        hydrateObservability({
          conversationId,
          userRequests: [],
          requests: [],
          toolCalls: step.toolCalls,
        }),
      );
      return { unwrap: () => Promise.resolve({ conversationId }) };
    },
}));
jest.mock("../resume-instance.thunk", () => ({
  resumeInstance:
    (args: { conversationId: string; userRequestId: string }) =>
    (dispatch: (action: unknown) => unknown) => {
      mockResumes.push(args);
      const step = mockResumeScript.shift() ?? { status: "complete" };
      if ("reject" in step) {
        return { unwrap: () => Promise.reject(step.reject) };
      }
      const { setInstanceStatus } = jest.requireActual(
        "../../conversations/conversations.slice",
      );
      dispatch(
        setInstanceStatus({
          conversationId: args.conversationId,
          status: step.status,
        }),
      );
      return { unwrap: () => Promise.resolve({ requestId: "req_resume" }) };
    },
}));
jest.mock("sonner", () => ({
  // Callable with error+warning: @ai-matrx/kit's createMatrxToast refuses a
  // non-callable toast object at module load.
  toast: Object.assign(jest.fn(), {
    error: mockToastError,
    warning: jest.fn(),
  }),
}));

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  createInstance,
  destroyInstance,
  setInstanceStatus,
} from "../../conversations/conversations.slice";
import {
  addPendingToolCall,
  createRequest,
  upsertToolLifecycle,
} from "../../active-requests/active-requests.slice";
import {
  registerAbortController,
  unregisterAbortController,
} from "../abort-registry";
import {
  __resetDesktopDelegationWatchesForTests,
  watchDesktopDelegation,
  type WatchDesktopDelegationArgs,
} from "../watch-desktop-delegation.thunk";

const CONVERSATION_ID = "conversation-1";
const USER_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const LIFECYCLE_A = "req_client-lifecycle";
const LIFECYCLE_B = "req_reentrant-lifecycle";
const POLL_MS = 750;

function ledgerRow(callId: string): PendingCallSummary {
  return {
    id: `row-${callId}`,
    call_id: callId,
    conversation_id: CONVERSATION_ID,
    user_request_id: USER_REQUEST_ID,
    message_id: "22222222-2222-4222-8222-222222222222",
    tool_name: "local_file_ops",
    arguments: { operation: "read", path: "/tmp/notes.txt" },
    iteration: 1,
    created_at: "2026-09-10T12:00:00Z",
    expires_at: "2026-10-10T12:00:00Z",
    target_instance_id: "desktop-1",
    claimed_by_instance_id: null,
    claim_expires_at: null,
    execution_authorization: null,
  };
}

function resolvedToolCall(callId: string): CxToolCallRecord {
  return {
    id: `tool-row-${callId}`,
    conversationId: CONVERSATION_ID,
    userRequestId: USER_REQUEST_ID,
    messageId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    callId,
    toolName: "local_file_ops",
    toolNameAsCalled: "local_file_ops",
    toolType: "delegated",
    iteration: 1,
    status: "completed",
    success: true,
    isError: false,
    errorType: null,
    errorMessage: null,
    arguments: { operation: "read", path: "/tmp/notes.txt" },
    output: "file contents",
    outputChars: 13,
    outputPreview: null,
    outputType: "text",
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 42,
    startedAt: "2026-09-10T12:00:00Z",
    completedAt: "2026-09-10T12:00:01Z",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: null,
    metadata: {},
    createdAt: "2026-09-10T12:00:00Z",
    deletedAt: null,
  };
}

function makeStore(status: InstanceStatus = "paused") {
  // Same dev-check posture as the production makeStore (lib/redux/store.ts).
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: "agent-1",
      agentType: "user",
      origin: "manual",
      status,
    }),
  );
  return store;
}

type TestStore = ReturnType<typeof makeStore>;

/** Seed what surfaceDelegatedToolCall leaves behind for one delegated call. */
function seedDelegatedCall(
  store: TestStore,
  lifecycleRequestId: string,
  callId: string,
): void {
  if (!store.getState().activeRequests.byRequestId[lifecycleRequestId]) {
    store.dispatch(
      createRequest({
        requestId: lifecycleRequestId,
        conversationId: CONVERSATION_ID,
      }),
    );
  }
  store.dispatch(
    addPendingToolCall({
      requestId: lifecycleRequestId,
      toolCall: { callId, toolName: "local_file_ops", arguments: {} },
    }),
  );
  store.dispatch(
    upsertToolLifecycle({
      requestId: lifecycleRequestId,
      callId,
      toolName: "local_file_ops",
      status: "started",
      isDelegated: true,
    }),
  );
}

function watch(
  store: TestStore,
  args: Partial<WatchDesktopDelegationArgs> & { callId: string },
): Promise<void> {
  return store.dispatch(
    watchDesktopDelegation({
      conversationId: CONVERSATION_ID,
      lifecycleRequestId: LIFECYCLE_A,
      ...args,
    }),
  );
}

/** Reconciled = the live stub is gone and the pending call is resolved. */
function reconciliation(
  store: TestStore,
  lifecycleRequestId: string,
  callId: string,
) {
  const request = store.getState().activeRequests.byRequestId[lifecycleRequestId];
  return {
    liveStubPresent: callId in request.toolLifecycle,
    resolved:
      request.pendingToolCalls.find((call) => call.callId === callId)
        ?.resolved ?? null,
  };
}

const RECONCILED = { liveStubPresent: false, resolved: true };
const UNRECONCILED = { liveStubPresent: true, resolved: false };

describe("watchDesktopDelegation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLedgerScript.length = 0;
    mockLoadScript.length = 0;
    mockResumeScript.length = 0;
    mockResumes.length = 0;
    mockCounts.ledgerReads = 0;
    mockCounts.loads = 0;
    mockToastError.mockReset();
    __resetDesktopDelegationWatchesForTests();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    __resetDesktopDelegationWatchesForTests();
    unregisterAbortController(CONVERSATION_ID);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("never hydrates or resumes while a sibling call on the same request is still pending", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    seedDelegatedCall(store, LIFECYCLE_B, "call-2");
    mockLedgerScript.push([ledgerRow("call-2")], []);

    const first = watch(store, {
      lifecycleRequestId: LIFECYCLE_A,
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });
    const second = watch(store, {
      lifecycleRequestId: LIFECYCLE_B,
      userRequestId: USER_REQUEST_ID,
      callId: "call-2",
    });
    expect(second).toBe(first);

    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(mockCounts.loads).toBe(0);
    expect(mockResumes).toEqual([]);
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(UNRECONCILED);

    await jest.advanceTimersByTimeAsync(POLL_MS);
    await first;
    expect(mockResumes).toEqual([
      { conversationId: CONVERSATION_ID, userRequestId: USER_REQUEST_ID },
    ]);
    expect(mockCounts.loads).toBe(2); // resolved tool rows, then the continuation
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
    expect(reconciliation(store, LIFECYCLE_B, "call-2")).toEqual(RECONCILED);
  });

  it("retries a transient resolved-tool hydration failure before resuming", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    mockLoadScript.push({ fail: new Error("temporary Supabase outage") });

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });

    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(mockResumes).toEqual([]);
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(UNRECONCILED);

    await jest.advanceTimersByTimeAsync(POLL_MS);
    await done;
    expect(mockCounts.loads).toBe(3); // failed, successful, final
    expect(mockResumes).toHaveLength(1);
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
  });

  it.each([
    ["no user_request id", undefined],
    ["the Redux lifecycle key passed as the user_request id", LIFECYCLE_A],
  ])(
    "resumes with the server UUID from the ledger when given %s",
    async (_label, userRequestId) => {
      const store = makeStore();
      seedDelegatedCall(store, LIFECYCLE_A, "call-1");
      mockLedgerScript.push([ledgerRow("call-1")], []);

      const done = watch(store, { userRequestId, callId: "call-1" });
      await jest.advanceTimersByTimeAsync(POLL_MS * 2);
      await done;

      expect(mockResumes).toEqual([
        { conversationId: CONVERSATION_ID, userRequestId: USER_REQUEST_ID },
      ]);
    },
  );

  it("does not re-hydrate while another runner still owns the resume", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    mockResumeScript.push({ status: "paused" }, { status: "complete" });

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });

    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(mockCounts.loads).toBe(1);
    await jest.advanceTimersByTimeAsync(5_250);
    await done;

    expect(mockResumes).toHaveLength(2);
    expect(mockCounts.loads).toBe(2); // initial resolution + one final authoritative read
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
  });

  it("recovers a UUID the first poll missed from the hydrated tool-call ledger", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    mockLoadScript.push({ toolCalls: [resolvedToolCall("call-1")] });

    const done = watch(store, { callId: "call-1" });
    await jest.advanceTimersByTimeAsync(POLL_MS);
    await done;

    expect(mockResumes).toEqual([
      { conversationId: CONVERSATION_ID, userRequestId: USER_REQUEST_ID },
    ]);
    expect(mockCounts.loads).toBe(2);
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
  });

  it("folds a re-entrant watcher onto the recovered UUID and reconciles both lifecycles", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    seedDelegatedCall(store, LIFECYCLE_B, "call-2");
    mockLedgerScript.push([ledgerRow("call-1")], []);

    const first = watch(store, {
      lifecycleRequestId: LIFECYCLE_A,
      callId: "call-1",
    });
    await jest.advanceTimersByTimeAsync(POLL_MS);

    const second = watch(store, {
      lifecycleRequestId: LIFECYCLE_B,
      userRequestId: USER_REQUEST_ID,
      callId: "call-2",
    });
    expect(second).toBe(first);

    await jest.advanceTimersByTimeAsync(POLL_MS);
    await first;
    expect(mockResumes).toHaveLength(1);
    expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
    expect(reconciliation(store, LIFECYCLE_B, "call-2")).toEqual(RECONCILED);
  });

  it.each([
    "resume_conflict — retry 1 scheduled",
    "Resume already claimed for this user_request",
  ])(
    "observes a competing resume after %s and hydrates its result silently",
    async (rejection) => {
      const store = makeStore();
      seedDelegatedCall(store, LIFECYCLE_A, "call-1");
      mockResumeScript.push({ reject: rejection });

      const done = watch(store, {
        userRequestId: USER_REQUEST_ID,
        callId: "call-1",
      });

      await jest.advanceTimersByTimeAsync(POLL_MS);
      // The winning runner (another tab or Matrx Local) completes the turn.
      store.dispatch(
        setInstanceStatus({ conversationId: CONVERSATION_ID, status: "complete" }),
      );
      await jest.advanceTimersByTimeAsync(POLL_MS);
      await done;

      expect(mockResumes).toHaveLength(1);
      expect(mockCounts.loads).toBe(2);
      expect(mockToastError).not.toHaveBeenCalled();
      expect(reconciliation(store, LIFECYCLE_A, "call-1")).toEqual(RECONCILED);
    },
  );

  it("retries the fallback hydration when the first bundle does not carry the call yet", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    mockLoadScript.push(
      { toolCalls: [] },
      { toolCalls: [resolvedToolCall("call-1")] },
    );

    const done = watch(store, { callId: "call-1" });

    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(mockResumes).toEqual([]);
    await jest.advanceTimersByTimeAsync(5_250);
    await done;

    expect(mockResumes).toEqual([
      { conversationId: CONVERSATION_ID, userRequestId: USER_REQUEST_ID },
    ]);
    expect(mockCounts.loads).toBe(3);
  });

  it.each(["cancelled", "error"] as const)(
    "stops before reading the ledger for a %s conversation",
    async (status) => {
      const store = makeStore(status);
      seedDelegatedCall(store, LIFECYCLE_A, "call-1");

      const done = watch(store, {
        userRequestId: USER_REQUEST_ID,
        callId: "call-1",
      });
      await jest.advanceTimersByTimeAsync(POLL_MS);
      await done;

      expect(mockCounts.ledgerReads).toBe(0);
      expect(mockCounts.loads).toBe(0);
      expect(mockResumes).toEqual([]);
    },
  );

  it("releases the watcher once its conversation is torn down", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    const args = { userRequestId: USER_REQUEST_ID, callId: "call-1" };

    const first = watch(store, args);
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    store.dispatch(destroyInstance(CONVERSATION_ID));
    await jest.advanceTimersByTimeAsync(POLL_MS * 3);

    expect(settled).toBe(true);
    expect(mockCounts.ledgerReads).toBe(0);
    expect(watch(store, args)).not.toBe(first);
  });

  it("never hydrates over this tab's still-active stream", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    registerAbortController(CONVERSATION_ID, new AbortController());

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });
    await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(mockCounts.ledgerReads).toBe(3);
    expect(mockCounts.loads).toBe(0);
    expect(mockResumes).toEqual([]);

    unregisterAbortController(CONVERSATION_ID);
    await jest.advanceTimersByTimeAsync(POLL_MS);
    await done;
    expect(mockResumes).toHaveLength(1);
  });

  it("surfaces a rejected resume and stops the watcher", async () => {
    const store = makeStore("ready");
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    mockResumeScript.push({ reject: "No backend URL configured" });

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });
    await jest.advanceTimersByTimeAsync(POLL_MS);
    await done;
    await jest.advanceTimersByTimeAsync(POLL_MS * 4);

    expect(mockResumes).toHaveLength(1);
    expect(mockCounts.ledgerReads).toBe(1);
    expect(mockToastError).toHaveBeenCalledWith(
      "Desktop tool continuation failed",
      expect.objectContaining({ description: "No backend URL configured" }),
    );
  });

  it("tells the user once, only after eight consecutive ledger failures, and keeps retrying", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    for (let i = 0; i < 8; i += 1) {
      mockLedgerScript.push(new Error("persistent API failure"));
    }

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });

    await jest.advanceTimersByTimeAsync(POLL_MS * 7);
    expect(mockToastError).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith(
      "Desktop tool status is unavailable",
      expect.objectContaining({
        description: expect.stringContaining("has not been discarded"),
      }),
    );

    await jest.advanceTimersByTimeAsync(POLL_MS);
    await done;
    expect(mockCounts.ledgerReads).toBe(9);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockResumes).toHaveLength(1);
  });

  it("restarts the failure count after a successful ledger read", async () => {
    const store = makeStore();
    seedDelegatedCall(store, LIFECYCLE_A, "call-1");
    const failures = (count: number) =>
      Array.from({ length: count }, () => new Error("flaky API"));
    mockLedgerScript.push(
      ...failures(7),
      [ledgerRow("call-1")],
      ...failures(7),
      [],
    );

    const done = watch(store, {
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    });
    await jest.advanceTimersByTimeAsync(POLL_MS * 16);
    await done;

    expect(mockCounts.ledgerReads).toBe(16);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockResumes).toHaveLength(1);
  });
});
