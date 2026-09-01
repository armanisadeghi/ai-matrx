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
});
