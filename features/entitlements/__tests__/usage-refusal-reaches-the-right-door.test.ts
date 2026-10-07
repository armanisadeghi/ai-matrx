/**
 * A usage refusal reaches exactly ONE door (USAGE-GATE.md "Contract"):
 *   - a person refused (`usage_limit_reached`, HTTP 402) → state `over` + the
 *     limit dialog, and never the guest reminder;
 *   - a guest refused (`guest_ai_allowance_used`, or a 402 with nobody signed
 *     in) → the guest sign-up reminder, and never the upgrade dialog;
 *   - the same holds when the refusal arrives MID-STREAM as an `error` event;
 *   - the near / over notice is once per window, not once per recompute;
 *   - the after-call refresh lands after the server settles, and a settled
 *     server answer replaces it.
 *
 * Driven through the real choke points (`runAiStream`, `processStream`), the
 * real slice reducer and the real guest-allowance listener seam. Mocked: the
 * one browser usage read and `fetch`.
 */

import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";

const g = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (typeof g.TextEncoder !== "function") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder !== "function") g.TextDecoder = NodeTextDecoder;

jest.mock("../usage-gate/usageRead", () => ({
  readUsageSnapshot: jest.fn(),
}));

import { configureStore } from "@reduxjs/toolkit";
import entitlementsReducer, {
  setUsageSnapshot,
} from "../state/entitlementsSlice";
import { readUsageSnapshot } from "../usage-gate/usageRead";
import {
  applyServerUsageState,
  cancelPendingUsageRefreshForTests,
  classifyUsageRefusal,
  noteAiCallEnded,
  REFRESH_AFTER_CALL_MS,
} from "../usage-gate/usageGate";
import { usageNoticeKey, type UsageSnapshot } from "../usage-gate/usageState";
import {
  isPaidAiCall,
  paidAiPostPaths,
} from "../usage-gate/paidAiPaths";
import { onGuestAiAllowanceUsed } from "@/lib/guest/guest-ai-allowance";
import { runAiStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/run-ai-stream";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { readFileSync } from "node:fs";

const readMock = readUsageSnapshot as jest.MockedFunction<
  typeof readUsageSnapshot
>;

const OVER_STATE = {
  scope: "user",
  subject_id: "user-1",
  plan_key: "free",
  plan_name: "Free",
  required_tier: "pro",
  state: "over",
  near_ratio: 0.8,
  binding_period: "week",
  resets_at: "2026-10-10T00:00:00Z",
  windows: [
    {
      period: "week",
      limit: 100,
      used: 100,
      remaining: 0,
      resets_at: "2026-10-10T00:00:00Z",
      state: "over",
    },
  ],
  computed_at: "2026-10-03T00:00:00Z",
  enforced: true,
};

/** The documented refusal body (HTTP 402, or a stream error's `details`). */
const PERSON_REFUSAL = {
  error: "usage_limit_reached",
  message: "You've used this week's AI points.",
  fix_action: "upgrade_plan",
  required_tier: "pro",
  plan_key: "free",
  state: "over",
  binding_period: "week",
  limit: 100,
  used: 100,
  resets_at: "2026-10-10T00:00:00Z",
  usage: OVER_STATE,
};

const GUEST_REFUSAL = {
  ...PERSON_REFUSAL,
  error: "guest_ai_allowance_used",
  plan_key: "guest",
  usage: { ...OVER_STATE, plan_key: "guest", plan_name: "Guest" },
};

function snapshot(state: UsageSnapshot["state"]): UsageSnapshot {
  return {
    state,
    freePeriod: null,
    planKey: "free",
    planName: "Free",
    bindingPeriod: "week",
    resetsAt: "2026-10-10T00:00:00Z",
    windows: [],
    computedAt: "2026-10-03T00:00:00Z",
    enforced: true,
  };
}

function makeStore(userId: string | null) {
  return configureStore({
    reducer: {
      entitlements: entitlementsReducer,
      userAuth: (s: { id: string | null } = { id: userId }) => s,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

/** The chat slices the runners read, empty, merged over the test store. */
function chatState(store: Store) {
  return {
    activeRequests: { byRequestId: {} },
    conversations: { byConversationId: {} },
    instanceUserInput: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    instanceResources: { byConversationId: {} },
    instanceVariableValues: { byConversationId: {} },
    messages: { byConversationId: {} },
    observability: { toolCalls: {}, userRequests: {}, requests: {} },
    ...store.getState(),
  };
}

function forward(store: Store) {
  return (a: unknown) => {
    if (typeof a === "function") return a;
    store.dispatch(a as { type: string });
    return a;
  };
}

function startTurn(store: Store) {
  return runAiStream({
    url: "https://server.test/ai/agents/agent-1",
    requestId: "req-1",
    conversationId: "conv-1",
    headers: {},
    body: {},
    channel: "global",
    dispatch: forward(store),
    getState: (() => chatState(store)) as never,
    submitAt: 0,
    kind: "turn",
  } as never);
}

function refusedResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    statusText: "Refused",
    headers: new Headers(),
    json: async () => body,
    body: null,
  };
}

let guestReminders: number;
let stopListening: () => void;

beforeEach(() => {
  configureServerForTest({});
  jest.useFakeTimers();
  readMock.mockReset();
  readMock.mockResolvedValue(null);
  guestReminders = 0;
  stopListening = onGuestAiAllowanceUsed(() => {
    guestReminders += 1;
  });
});

afterEach(() => {
  stopListening();
  cancelPendingUsageRefreshForTests();
  jest.useRealTimers();
});

function mockFetch(status: number, body: unknown) {
  Object.defineProperty(globalThis, "fetch", {
    value: jest.fn().mockResolvedValue(refusedResponse(status, body)),
    configurable: true,
    writable: true,
  });
}

// ── 1. HTTP refusals ────────────────────────────────────────────────────────

test("a guest's 402 opens the guest reminder, never the upgrade dialog", async () => {
  mockFetch(402, GUEST_REFUSAL);
  const store = makeStore(null);
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(guestReminders).toBe(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
  expect(store.getState().entitlements.usageGate.state).toBe("unknown");
});

test("a bare 402 with nobody signed in is a guest's refusal", async () => {
  mockFetch(402, { error: "payment_required" });
  const store = makeStore(null);
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(guestReminders).toBe(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
});

test("a guest's 403 allowance refusal still reaches the reminder", async () => {
  mockFetch(403, { error: "guest_ai_allowance_used", message: "Sign up" });
  const store = makeStore(null);
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(guestReminders).toBe(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
});

test("a person's 402 holds over + the limit dialog, never the guest reminder", async () => {
  mockFetch(402, PERSON_REFUSAL);
  const store = makeStore("user-1");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(guestReminders).toBe(0);
  const gate = store.getState().entitlements.usageGate;
  expect(gate.state).toBe("over");
  expect(gate.refusal?.period).toBe("week");
  expect(gate.refusal?.used).toBe(100);
  // The full state under `usage` won over the refusal's flat fields.
  expect(gate.windows).toHaveLength(1);
});

test("classification: the guest code wins; non-usage failures are nobody's", () => {
  const signedIn = () => ({ userAuth: { id: "user-1" } });
  expect(classifyUsageRefusal(402, GUEST_REFUSAL, signedIn)).toBe("guest");
  expect(classifyUsageRefusal(402, PERSON_REFUSAL, signedIn)).toBe("person");
  expect(classifyUsageRefusal(500, { error: "boom" }, signedIn)).toBeNull();
  expect(classifyUsageRefusal(403, { error: "attachment_access_denied" }, signedIn)).toBeNull();
});

// ── 2. Mid-stream refusals ──────────────────────────────────────────────────

function streamOf(events: unknown[]) {
  const enc = new TextEncoder();
  const queue = events.map((e) => enc.encode(`${JSON.stringify(e)}\n`));
  const reader = {
    read: async () =>
      queue.length > 0 ? { value: queue.shift(), done: false } : { done: true },
    releaseLock() {},
  };
  return {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;
}

async function runStream(store: Store, errorData: unknown) {
  const promise = processStream({
    requestId: "req-s",
    conversationId: "11111111-1111-4111-8111-111111111111",
    response: streamOf([{ event: "error", data: errorData }]),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: forward(store) as never,
    getState: (() => chatState(store)) as never,
    abortController: new AbortController(),
    heartbeatTimeoutMs: 30_000,
    maxLifetimeMs: 60_000,
  });
  promise.catch(() => undefined);
  await jest.advanceTimersByTimeAsync(1_000);
}

test("a person's refusal arriving mid-stream holds over and opens the limit dialog", async () => {
  const store = makeStore("user-1");
  store.dispatch(setUsageSnapshot({ snapshot: snapshot("near"), fetchedAt: 1 }));
  await runStream(store, {
    error_type: "usage_limit_reached",
    code: "usage_limit_reached",
    message: "Limit reached",
    details: PERSON_REFUSAL,
  });
  const gate = store.getState().entitlements.usageGate;
  expect(gate.state).toBe("over");
  expect(gate.refusal?.period).toBe("week");
  expect(guestReminders).toBe(0);
});

test("a guest's refusal arriving mid-stream opens only the guest reminder", async () => {
  const store = makeStore(null);
  await runStream(store, {
    error_type: "guest_ai_allowance_used",
    message: "Create a free account",
    details: GUEST_REFUSAL,
  });
  expect(guestReminders).toBeGreaterThanOrEqual(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
});

// ── 3. Notice dedupe ────────────────────────────────────────────────────────

test("the near notice key ignores a rolling window's moving reset, keeps a fixed one's", () => {
  expect(usageNoticeKey("near", "rolling_5h", "2026-10-03T10:00:00Z")).toBe(
    usageNoticeKey("near", "rolling_5h", "2026-10-03T10:07:00Z"),
  );
  expect(usageNoticeKey("near", "week", "2026-10-10T00:00:00Z")).not.toBe(
    usageNoticeKey("near", "week", "2026-10-17T00:00:00Z"),
  );
  expect(usageNoticeKey("near", "week", "x")).not.toBe(
    usageNoticeKey("over", "week", "x"),
  );
});

// ── 4. After-call refresh timing ────────────────────────────────────────────

test("the after-call refresh waits for the server to settle", async () => {
  readMock.mockResolvedValue(snapshot("near"));
  const store = makeStore("user-1");
  noteAiCallEnded(store.dispatch as never, store.getState);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(readMock).not.toHaveBeenCalled();
  expect(store.getState().entitlements.usageGate.stale).toBe(true);
  await jest.advanceTimersByTimeAsync(REFRESH_AFTER_CALL_MS);
  expect(readMock).toHaveBeenCalledTimes(1);
});

test("a settled server answer (the directive) replaces the pending refresh", async () => {
  const store = makeStore("user-1");
  noteAiCallEnded(store.dispatch as never, store.getState);
  expect(
    applyServerUsageState(store.dispatch as never, OVER_STATE, { settled: true }),
  ).toBe(true);
  await jest.advanceTimersByTimeAsync(REFRESH_AFTER_CALL_MS * 2);
  expect(readMock).not.toHaveBeenCalled();
  expect(store.getState().entitlements.usageGate.state).toBe("over");
});

test("a mid-stream info event (pre-spend) does not cancel the after-call refresh", async () => {
  const store = makeStore("user-1");
  noteAiCallEnded(store.dispatch as never, store.getState);
  applyServerUsageState(store.dispatch as never, { metadata: { usage: OVER_STATE } });
  await jest.advanceTimersByTimeAsync(REFRESH_AFTER_CALL_MS + 100);
  expect(readMock).toHaveBeenCalledTimes(1);
});

// ── 5. The paid-AI census ───────────────────────────────────────────────────

test("every paid-AI path in the census is a real POST endpoint of the server", () => {
  const types = readFileSync(
    require.resolve("@ai-matrx/agents/generated/api-types").replace(
      /api-types\.c?js$/,
      "api-types.d.ts",
    ),
    "utf8",
  );
  const missing = paidAiPostPaths().filter((p) => {
    const at = types.indexOf(`\n    "${p}": {`);
    if (at === -1) return true;
    const block = types.slice(at, types.indexOf("\n    };", at));
    return !/\n        post: (operations|\{)/.test(block);
  });
  expect(missing).toEqual([]);
  expect(paidAiPostPaths().length).toBeGreaterThan(20);
});

test("the census gates POSTs only, and a /v2 prefix is the same endpoint", () => {
  expect(isPaidAiCall("POST", "/ai/mandates/{mandate_key}")).toBe(true);
  expect(isPaidAiCall("POST", "/v2/ai/mandates/{mandate_key}")).toBe(true);
  expect(isPaidAiCall("GET", "/mandates/{mandate_key}/tests")).toBe(false);
  expect(isPaidAiCall("POST", "/ai/conversations/{conversation_id}/resume")).toBe(false);
  expect(isPaidAiCall("POST", "/images/generate")).toBe(true);
});
