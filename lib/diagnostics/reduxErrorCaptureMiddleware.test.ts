import {
  captureError,
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  isStreamWrapperDuplicate,
  reduxErrorCaptureMiddleware,
} from "@/lib/diagnostics/reduxErrorCaptureMiddleware";

describe("reduxErrorCaptureMiddleware stream ownership", () => {
  beforeEach(() => clearCapturedErrors());

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
