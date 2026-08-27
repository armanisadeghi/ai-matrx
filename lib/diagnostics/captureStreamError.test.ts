import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  captureStreamClientError,
  captureStreamTransportError,
  wasStreamErrorCaptured,
} from "@/lib/diagnostics/captureStreamError";
import { BackendApiError } from "@/lib/api/errors";

describe("captureStreamTransportError", () => {
  beforeEach(() => {
    clearCapturedErrors();
  });

  it("records the transport failure with its stream identity", () => {
    const error = new BackendApiError({
      code: "internal_error",
      detail: "network error",
      userMessage: "The connection to the AI response was lost.",
      requestId: "b1533b86-960c-4abc-94b0-964bd0000000",
    });

    captureStreamTransportError(error, {
      conversationId: "conv-1",
    });

    expect(getSnapshot()[0]).toMatchObject({
      source: "agent-stream-transport",
      code: "internal_error",
      message: "network error",
      requestId: "b1533b86-960c-4abc-94b0-964bd0000000",
      conversationId: "conv-1",
    });
  });

  it("marks the thrown error so callApi does not capture it a second time", () => {
    // parseNdjsonStream captures and then RE-THROWS, so the same object reaches
    // callApi's catch. One dropped socket must produce exactly one red row.
    const error = new BackendApiError({
      code: "internal_error",
      detail: "network error",
      userMessage: "The connection to the AI response was lost.",
    });

    expect(wasStreamErrorCaptured(error)).toBe(false);
    captureStreamTransportError(error);
    expect(wasStreamErrorCaptured(error)).toBe(true);
  });

  it("does not claim unrelated throws", () => {
    expect(wasStreamErrorCaptured(new Error("something else"))).toBe(false);
    expect(wasStreamErrorCaptured(undefined)).toBe(false);
    expect(wasStreamErrorCaptured("network error")).toBe(false);
  });

  it("does not recapture a parser-recorded transport loss at the stream runner", () => {
    const error = new BackendApiError({
      code: "stream_transport_lost",
      detail: "network error",
      userMessage: "The connection dropped. Reconnecting now.",
    });

    captureStreamTransportError(error, { conversationId: "conv-1" });
    captureStreamClientError({
      cause: error,
      errorType: "transport_lost",
      message: error.message,
      conversationId: "conv-1",
      requestId: "request-1",
    });

    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "agent-stream-transport",
      code: "stream_transport_lost",
    });
  });
});
