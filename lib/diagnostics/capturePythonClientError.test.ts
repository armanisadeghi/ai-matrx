import {
  captureError,
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { capturePythonClientError } from "@/lib/diagnostics/capturePythonClientError";
import { BackendApiError } from "@/lib/api/errors";

describe("capturePythonClientError", () => {
  beforeEach(() => {
    clearCapturedErrors();
  });

  it("keeps user-visible request failures red with complete network context", () => {
    const error = new TypeError("Failed to fetch", {
      cause: "CORS connection rejected",
    });
    error.stack =
      "TypeError: Failed to fetch\n    at syncPagespeed (data.ts:103:9)";

    capturePythonClientError(error, {
      url: "https://server.app.matrxserver.com/seo/pages/page-1/pagespeed/sync",
      method: "POST",
      path: "/seo/pages/page-1/pagespeed/sync",
      requestId: "client-request-123",
    });

    const captured = getSnapshot()[0];
    expect(captured).toMatchObject({
      source: "api-network",
      tier: "red",
      relation: "POST /seo/pages/page-1/pagespeed/sync",
      code: "network_error",
      message: "Failed to fetch",
      name: "TypeError",
      requestId: "client-request-123",
      stack: error.stack,
    });
    expect(captured.raw).toMatchObject({
      method: "POST",
      path: "/seo/pages/page-1/pagespeed/sync",
      requestId: "client-request-123",
      thrown: {
        name: "TypeError",
        message: "Failed to fetch",
        cause: "CORS connection rejected",
      },
    });
  });

  it("does not downgrade a failure merely because a toast showed it", () => {
    captureError({
      source: "user-toast",
      message: "PageSpeed Insights sync failed — Failed to fetch",
    });

    expect(getSnapshot()[0]).toMatchObject({
      source: "user-toast",
      tier: "red",
      tierRuleId: undefined,
    });
  });

  it("classifies a client deadline as request_timeout and preserves the client request id", () => {
    capturePythonClientError(
      new BackendApiError({
        code: "request_timeout",
        detail:
          "POST https://server.app.matrxserver.com/audio/transcribe exceeded 30000ms",
        userMessage: "The request timed out — please retry.",
        status: 504,
      }),
      {
        url: "https://server.app.matrxserver.com/audio/transcribe",
        method: "POST",
        path: "/audio/transcribe",
        requestId: "chunk-request-123",
      },
    );

    expect(getSnapshot()[0]).toMatchObject({
      source: "api-network",
      tier: "red",
      relation: "POST /audio/transcribe",
      code: "request_timeout",
      message:
        "POST https://server.app.matrxserver.com/audio/transcribe exceeded 30000ms",
      userMessage: "The request timed out — please retry.",
      requestId: "chunk-request-123",
    });
  });
});
