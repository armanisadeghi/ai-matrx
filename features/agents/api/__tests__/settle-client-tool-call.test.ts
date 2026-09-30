/**
 * FORCING TEST — a tool call the client answered is DONE on the client.
 *
 * THE INCIDENT (2026-09-30): a delegated `apply_surface_write` was approved and
 * applied, the agent resumed and wrote its summary, and the tool card under it
 * still said "Working…". The server never sends a completion event for a
 * delegated call (it hard-suspended), and the two client stores that draw the
 * card — `activeRequests.toolLifecycle` (live) and `observability.toolCalls`
 * (every committed card) — were only ever updated by server events.
 *
 * Green only when `submitToolResult` itself settles BOTH stores, with no help
 * from the dispatcher. Red against the pre-fix funnel, which touched neither.
 */

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn(() => ({ type: "test/noop" })),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { configureStore, combineReducers } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertToolLifecycle,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import observabilityReducer, {
  upsertToolCall,
  type CxToolCallRecord,
} from "@/features/agents/redux/execution-system/observability/observability.slice";
import { settleClientToolCall } from "../settle-client-tool-call";
import {
  submitToolResult,
  __resetOutboxForTests,
} from "../submit-tool-results";

const CONVERSATION_ID = "c0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "req-1";
const CALL_ID = "toolu_settle_1";

function makeStore() {
  const store = configureStore({
    reducer: combineReducers({
      activeRequests: activeRequestsReducer,
      observability: observabilityReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  // The mini store has only the two slices the thunk reads, so it is not the
  // app's RootState — let it accept the thunk without a per-call cast.
  return store as typeof store & { dispatch: (action: unknown) => unknown };
}

function seed(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    createRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
    } as Parameters<typeof createRequest>[0]),
  );
  store.dispatch(
    upsertToolLifecycle({
      requestId: REQUEST_ID,
      callId: CALL_ID,
      toolName: "apply_surface_write",
      status: "started",
      isDelegated: true,
    }),
  );
  // What process-stream's end-of-stream flush leaves behind.
  store.dispatch(
    upsertToolCall({
      id: "row-1",
      conversationId: CONVERSATION_ID,
      userRequestId: null,
      messageId: null,
      userId: "",
      callId: CALL_ID,
      toolName: "apply_surface_write",
      toolNameAsCalled: null,
      toolType: "",
      iteration: 1,
      status: "started",
      success: false,
      isError: null,
      errorType: null,
      errorMessage: null,
      arguments: {},
      output: null,
      outputChars: 0,
      outputPreview: null,
      outputType: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      durationMs: 0,
      startedAt: "2026-09-30T22:52:45.000Z",
      completedAt: "",
      parentCallId: null,
      retryCount: null,
      persistKey: null,
      filePath: null,
      executionEvents: null,
      metadata: null,
      createdAt: "2026-09-30T22:52:45.000Z",
      deletedAt: null,
    } as CxToolCallRecord),
  );
}

describe("a client-answered tool call settles on the client", () => {
  beforeEach(() => __resetOutboxForTests());

  it("settles the live lifecycle AND the persisted row", () => {
    const store = makeStore();
    seed(store);
    store.dispatch(
      settleClientToolCall({
        conversationId: CONVERSATION_ID,
        call_id: CALL_ID,
        tool_name: "apply_surface_write",
        output: { ok: true },
      }),
    );
    const state = store.getState();
    expect(
      state.activeRequests.byRequestId[REQUEST_ID].toolLifecycle[CALL_ID].status,
    ).toBe("completed");
    expect(state.observability.toolCalls["row-1"].status).toBe("completed");
    expect(state.observability.toolCalls["row-1"].output).toBe('{"ok":true}');
  });

  it("marks an errored answer as failed in both stores", () => {
    const store = makeStore();
    seed(store);
    store.dispatch(
      settleClientToolCall({
        conversationId: CONVERSATION_ID,
        call_id: CALL_ID,
        tool_name: "apply_surface_write",
        is_error: true,
        error_message: "nope",
        output: { ok: false },
      }),
    );
    const state = store.getState();
    expect(
      state.activeRequests.byRequestId[REQUEST_ID].toolLifecycle[CALL_ID].status,
    ).toBe("error");
    expect(state.observability.toolCalls["row-1"].status).toBe("failed");
    expect(state.observability.toolCalls["row-1"].isError).toBe(true);
  });

  it("is settled by the submitToolResult funnel itself — no dispatcher help", () => {
    const store = makeStore();
    seed(store);
    store.dispatch(
      submitToolResult({
        conversationId: CONVERSATION_ID,
        call_id: CALL_ID,
        tool_name: "apply_surface_write",
        output: { ok: true },
      }),
    );
    const state = store.getState();
    expect(
      state.activeRequests.byRequestId[REQUEST_ID].toolLifecycle[CALL_ID].status,
    ).toBe("completed");
    expect(state.observability.toolCalls["row-1"].status).toBe("completed");
  });

  it("never downgrades a call another path already settled", () => {
    const store = makeStore();
    seed(store);
    store.dispatch(
      upsertToolLifecycle({
        requestId: REQUEST_ID,
        callId: CALL_ID,
        toolName: "apply_surface_write",
        status: "error",
        errorType: "surface_write_failed",
        errorMessage: "richer detail",
      }),
    );
    store.dispatch(
      settleClientToolCall({
        conversationId: CONVERSATION_ID,
        call_id: CALL_ID,
        tool_name: "apply_surface_write",
        output: { ok: true },
      }),
    );
    const entry =
      store.getState().activeRequests.byRequestId[REQUEST_ID].toolLifecycle[CALL_ID];
    expect(entry.status).toBe("error");
    expect(entry.errorMessage).toBe("richer detail");
  });
});
