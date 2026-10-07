/**
 * THE USAGE GATE — client request path (USAGE-GATE.md rules 8-12), driven
 * through the REAL choke point `runAiStream` and the real slice reducer.
 *
 * The only seam mocked is the one browser read (`readUsageSnapshot`) and
 * `fetch`. Each case fails if the gate is removed, moved after the fetch, or
 * turned into an always-read:
 *   - cached ok      → the turn reaches fetch with ZERO usage reads;
 *   - cached near    → exactly one fresh read, BEFORE the fetch;
 *   - fresh over     → no fetch, refusal held for the dialog;
 *   - fresh ok       → the turn proceeds;
 *   - call end       → stale at once, refresh later, never awaited;
 *   - server notice  → the held state is replaced.
 */

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
  noteAiCallEnded,
  REFRESH_AFTER_CALL_MS,
} from "../usage-gate/usageGate";
import type { UsageSnapshot } from "../usage-gate/usageState";
import { runAiStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/run-ai-stream";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";

const readMock = readUsageSnapshot as jest.MockedFunction<
  typeof readUsageSnapshot
>;

function snapshot(state: UsageSnapshot["state"]): UsageSnapshot {
  return {
    state,
    freePeriod: null,
    planKey: "free",
    planName: "Free",
    bindingPeriod: "week",
    resetsAt: "2026-10-10T00:00:00Z",
    windows: [
      {
        period: "week",
        limit: 100,
        used: state === "over" ? 100 : state === "near" ? 85 : 10,
        remaining: state === "over" ? 0 : state === "near" ? 15 : 90,
        resetsAt: "2026-10-10T00:00:00Z",
        state,
      },
    ],
    computedAt: "2026-10-03T00:00:00Z",
    enforced: true,
  };
}

function makeStore(held: UsageSnapshot["state"] | null) {
  const store = configureStore({
    reducer: {
      entitlements: entitlementsReducer,
      userAuth: (s: { id: string | null } = { id: "user-1" }) => s,
    },
  });
  if (held) {
    store.dispatch(
      setUsageSnapshot({ snapshot: snapshot(held), fetchedAt: 1 }),
    );
  }
  return store;
}

const NETWORK_DOWN = new Error("network down");

function startTurn(store: ReturnType<typeof makeStore>) {
  return runAiStream({
    url: "https://server.test/ai/agents/agent-1",
    requestId: "req-1",
    conversationId: "conv-1",
    headers: {},
    body: {},
    channel: "global",
    dispatch: (a: unknown) => {
      // Only the entitlements actions matter here; chat-slice actions are
      // recorded by nothing (this store has no chat slices).
      store.dispatch(a as { type: string });
      return a;
    },
    // The chat slices the runner reads on its way to fetch, empty.
    getState: (() => ({
      conversations: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      ...store.getState(),
    })) as never,
    submitAt: 0,
    kind: "turn",
  } as never);
}

let fetchMock: jest.Mock;

beforeEach(() => {
  configureServerForTest({});
  jest.useFakeTimers();
  readMock.mockReset();
  fetchMock = jest.fn().mockRejectedValue(NETWORK_DOWN);
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cancelPendingUsageRefreshForTests();
  jest.useRealTimers();
});

test("cached ok: the turn reaches fetch with no usage read", async () => {
  const store = makeStore("ok");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(readMock).not.toHaveBeenCalled();
});

test("cached unknown: no usage read either", async () => {
  const store = makeStore(null);
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(readMock).not.toHaveBeenCalled();
});

test("cached near + fresh ok: exactly one fresh read, before the fetch, then proceeds", async () => {
  readMock.mockResolvedValue(snapshot("ok"));
  const store = makeStore("near");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(readMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(readMock.mock.invocationCallOrder[0]).toBeLessThan(
    fetchMock.mock.invocationCallOrder[0],
  );
  expect(store.getState().entitlements.usageGate.state).toBe("ok");
});

test("cached near + fresh over: the turn is stopped before fetch and the refusal is held", async () => {
  readMock.mockResolvedValue(snapshot("over"));
  const store = makeStore("near");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(readMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
  const gate = store.getState().entitlements.usageGate;
  expect(gate.state).toBe("over");
  expect(gate.refusal?.period).toBe("week");
  expect(gate.refusal?.used).toBe(100);
});

test("enforcement off: a fresh over never blocks — the turn goes out (same switch as the server)", async () => {
  readMock.mockResolvedValue({ ...snapshot("over"), enforced: false });
  const store = makeStore("over");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
});

test("cached over alone never blocks: a fresh ok lets the turn go", async () => {
  readMock.mockResolvedValue(snapshot("ok"));
  const store = makeStore("over");
  await expect(startTurn(store)).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(store.getState().entitlements.usageGate.refusal).toBeNull();
});

test("call end: marked stale at once, refreshed later in the background, never awaited", async () => {
  readMock.mockResolvedValue(snapshot("near"));
  const store = makeStore("ok");
  await expect(startTurn(store)).rejects.toBeDefined();
  // runAiStream returned (rejected) without awaiting any usage read.
  expect(readMock).not.toHaveBeenCalled();
  expect(store.getState().entitlements.usageGate.stale).toBe(true);

  await jest.advanceTimersByTimeAsync(REFRESH_AFTER_CALL_MS + 100);
  expect(readMock).toHaveBeenCalledTimes(1);
  const gate = store.getState().entitlements.usageGate;
  expect(gate.state).toBe("near");
  expect(gate.stale).toBe(false);
});

test("calls ending together share one background refresh", async () => {
  readMock.mockResolvedValue(snapshot("ok"));
  const store = makeStore("ok");
  noteAiCallEnded(store.dispatch as never, store.getState);
  noteAiCallEnded(store.dispatch as never, store.getState);
  noteAiCallEnded(store.dispatch as never, store.getState);
  await jest.advanceTimersByTimeAsync(REFRESH_AFTER_CALL_MS + 100);
  expect(readMock).toHaveBeenCalledTimes(1);
});

test("server notification (directive payload or info event) replaces the held state", () => {
  const store = makeStore("ok");
  const raw = {
    scope: "user",
    subject_id: "user-1",
    plan_key: "free",
    plan_name: "Free",
    state: "near",
    near_ratio: 0.8,
    binding_period: "week",
    resets_at: "2026-10-10T00:00:00Z",
    windows: [
      { period: "week", limit: 100, used: 85, remaining: 15, resets_at: "2026-10-10T00:00:00Z", state: "near" },
    ],
    computed_at: "2026-10-03T00:00:00Z",
  };
  expect(applyServerUsageState(store.dispatch as never, raw)).toBe(true);
  expect(store.getState().entitlements.usageGate.state).toBe("near");

  const infoEvent = {
    code: "usage_state",
    system_message: "usage",
    metadata: { ...raw, state: "over", windows: [{ ...raw.windows[0], used: 100, remaining: 0, state: "over" }] },
  };
  expect(applyServerUsageState(store.dispatch as never, infoEvent)).toBe(true);
  expect(store.getState().entitlements.usageGate.state).toBe("over");

  expect(applyServerUsageState(store.dispatch as never, { hello: 1 })).toBe(false);
  expect(store.getState().entitlements.usageGate.state).toBe("over");
});
