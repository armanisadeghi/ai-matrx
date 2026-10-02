import {
  captureError,
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  isStreamWrapperDuplicate,
  reduxErrorCaptureMiddleware,
} from "@/lib/diagnostics/reduxErrorCaptureMiddleware";
import { configureStore, createAsyncThunk } from "@reduxjs/toolkit";
import { serializeExecutionRejection } from "./executionRejectionMeta";

describe("reduxErrorCaptureMiddleware stream ownership", () => {
  beforeEach(() => clearCapturedErrors());

  it("refreshes correlation alongside repeated raw evidence and never invents an old request", () => {
    const next = jest.fn();
    const action = { type: "instances/execute/rejected", payload: "same failure" };
    for (const executionRequestId of ["first", "second", undefined]) {
      reduxErrorCaptureMiddleware({} as never)(next)({ ...action, meta: { executionRequestId, conversationId: executionRequestId ? "conversation-1" : undefined } });
      expect(getSnapshot()).toHaveLength(1);
      expect(getSnapshot()[0].requestId).toBe(executionRequestId);
    }
    expect(getSnapshot()[0].conversationId).toBeUndefined();
  });

  it("keeps smart-wrapper Error rejection semantics and captures forwarded identity", async () => {
    const thunk = createAsyncThunk("instances/smartExecute", async () => {
      throw Object.assign(new Error("stream considered dead"), {
        executionRequestId: "execution-request-1", conversationId: "conversation-1",
        originalErrorName: "HeartbeatTimeoutError", secret: "must-not-cross",
      });
    }, { serializeError: serializeExecutionRejection });
    const store = configureStore({ reducer: () => ({}), middleware: (defaults) => defaults().concat(reduxErrorCaptureMiddleware) });
    const promise = store.dispatch(thunk());
    const result = await promise;
    expect(result.payload).toBeUndefined();
    await expect(promise.unwrap()).rejects.toMatchObject({ name: "Error", message: "stream considered dead" });
    expect(JSON.stringify(result)).not.toContain("must-not-cross");
    expect(getSnapshot()[0]).toMatchObject({ requestId: "execution-request-1", conversationId: "conversation-1", name: "HeartbeatTimeoutError" });
  });

  it("preserves execution identity and heartbeat type through a string rejection", () => {
    const action = {
      type: "instances/execute/rejected",
      payload: "No server activity for 30000ms — stream considered dead",
      error: { message: "Rejected" },
      meta: {
        requestId: "local-rtk-id",
        executionRequestId: "execution-request-1",
        conversationId: "conversation-1",
        originalErrorName: "HeartbeatTimeoutError",
      },
    };
    const next = jest.fn();
    reduxErrorCaptureMiddleware({} as never)(next)(action);
    const captured = getSnapshot()[0];
    expect(captured.requestId).toBe(action.meta.executionRequestId);
    expect(captured.conversationId).toBe(action.meta.conversationId);
    expect(captured.name).toBe("HeartbeatTimeoutError");
    expect(captured.message).toBe(action.payload);
    expect(captured.browserProvenance).toBeDefined();
    expect(next).toHaveBeenCalledWith(action);
  });

  it("suppresses execute and smartExecute wrappers after canonical stream capture", () => {
    captureError({
      source: "agent-stream-client-error",
      message: "No server activity for 30000ms — stream considered dead",
    });
    const action = {
      type: "instances/execute/rejected",
      payload: "No server activity for 30000ms — stream considered dead",
      error: { message: "Rejected" },
    };

    expect(isStreamWrapperDuplicate(action)).toBe(true);

    const next = jest.fn();
    reduxErrorCaptureMiddleware({} as never)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(getSnapshot()).toHaveLength(1);

    expect(
      isStreamWrapperDuplicate({
        ...action,
        type: "instances/smartExecute/rejected",
        error: { name: "Error", message: action.payload },
      }),
    ).toBe(true);
  });

  it("keeps unrelated AI execution rejections actionable", () => {
    captureError({
      source: "agent-stream-client-error",
      message: "different stream failure",
    });
    expect(
      isStreamWrapperDuplicate({
        type: "instances/execute/rejected",
        payload: "agent model missing",
      }),
    ).toBe(false);
  });

  it("keeps one canonical transport incident when wrappers use its user message", () => {
    const userMessage =
      "The connection dropped. Your run is still going on the server — reconnecting to it now.";
    captureError({
      source: "agent-stream-transport",
      code: "stream_transport_lost",
      message: "network error",
      userMessage,
      requestId: "request-1",
    });
    for (const relation of [
      "instances/execute",
      "instances/smartExecute",
      "instances/executeManual",
    ]) {
      const action = {
        type: `${relation}/rejected`,
        error: { message: userMessage },
      };
      const next = jest.fn();
      reduxErrorCaptureMiddleware({} as never)(next)(action);
      expect(next).toHaveBeenCalledWith(action);
    }
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0].requestId).toBe("request-1");
    expect(
      isStreamWrapperDuplicate({
        type: "other/rejected",
        payload: userMessage,
      }),
    ).toBe(false);
    expect(
      isStreamWrapperDuplicate(
        { type: "instances/execute/rejected", payload: userMessage },
        Date.now() + 6000,
      ),
    ).toBe(false);
  });

  it("treats an unavailable session as a lifecycle pause, not an incident", () => {
    const action = {
      type: "notes/fetchNotesList/rejected",
      error: {
        name: "SessionUnavailableError",
        message: "Your session expired",
      },
    };
    const next = jest.fn();

    reduxErrorCaptureMiddleware({} as never)(next)(action);

    expect(next).toHaveBeenCalledWith(action);
    expect(getSnapshot()).toHaveLength(0);
  });
});

describe("reduxErrorCaptureMiddleware cancellation vs failure", () => {
  beforeEach(() => clearCapturedErrors());

  const run = (action: Record<string, unknown>) => {
    const next = jest.fn();
    reduxErrorCaptureMiddleware({} as never)(next)(action as never);
    expect(next).toHaveBeenCalledWith(action);
    return getSnapshot().length;
  };

  // The exact production action (class sec_d904494698f4…, 2026-10-02): supabase
  // postgrest stringifies a fetch AbortError into `{ code: "", message: "AbortError: …" }`
  // and the thunk rethrew that plain object, so RTK serialized no `name`.
  it.each([
    [
      "the stringified postgrest abort from production",
      {
        type: "cloudFiles/loadUserFileTree/rejected",
        error: { code: "", message: "AbortError: signal is aborted without reason" },
        meta: { requestId: "r1", rejectedWithValue: false },
      },
    ],
    ["meta.aborted", { type: "x/load/rejected", error: { message: "Aborted" }, meta: { aborted: true } }],
    ["meta.condition", { type: "x/load/rejected", error: { name: "ConditionError" }, meta: { condition: true } }],
    ["AbortError by name", { type: "x/load/rejected", error: { name: "AbortError", message: "The user aborted a request." } }],
    ["DOMException code 20 in a rejectWithValue payload", { type: "x/load/rejected", payload: { code: 20, message: "The operation was aborted." }, meta: { rejectedWithValue: true } }],
    ["ABORT_ERR code", { type: "x/load/rejected", error: { code: "ABORT_ERR", message: "aborted" } }],
    ["a stringified abort as a rejectWithValue string", { type: "x/load/rejected", payload: "AbortError: The operation was aborted.", meta: { rejectedWithValue: true } }],
  ])("does not capture a cancellation: %s", (_label, action) => {
    expect(run(action)).toBe(0);
  });

  it.each([
    ["a network 500", { type: "x/load/rejected", payload: "context_state_fetch_failed: 500 Internal Server Error", meta: { rejectedWithValue: true } }],
    ["a TimeoutError by name", { type: "cloudFiles/loadUserFileTree/rejected", error: { name: "TimeoutError", message: "Your file library took too long to load. Try again." } }],
    ["a stringified postgrest timeout", { type: "x/load/rejected", error: { code: "", message: "TimeoutError: signal timed out" } }],
    ["a plain error that merely mentions abort", { type: "x/load/rejected", error: { name: "Error", message: "Upload aborted by server: quota exceeded" } }],
  ])("still captures a real failure: %s", (_label, action) => {
    expect(run(action)).toBe(1);
  });
});
