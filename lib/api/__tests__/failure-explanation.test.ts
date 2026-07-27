/**
 * describeBackendFailure — the anti-secrecy guard.
 *
 * The streaming layer emits a templated `user_message` for every unclassified
 * crash while the true cause rides along in `message`, often as a stringified
 * upstream payload. A UI that shows only `user_message` reports nothing. These
 * tests lock in that the real sentence always wins.
 */
import {
  BackendApiError,
  describeBackendFailure,
  isGenericUserMessage,
  parsePersistedBackendError,
  parseStreamError,
  unwrapUpstreamError,
} from "../errors";

const GSC_STREAM_ERROR = {
  error_type: "canonicalgscsync_error",
  message:
    'aidream could not resolve GSC credential 7223fed4-7296-4f1e-9126-a83a96a917e9: HTTP 409 {"error":"conflict","message":"Google connection 7223fed4-7296-4f1e-9126-a83a96a917e9 has no vault credential — it needs re-authentication","user_message":"Something went wrong. Please try again later.","details":null,"request_id":"90029a97d75f4401a6f87ac3cafbf148"}',
  user_message:
    "CanonicalGscSync failed unexpectedly. Please try again or adjust your settings.",
  code: null,
  details: null,
};

describe("isGenericUserMessage", () => {
  it("rejects the streaming layer's templates and empty strings", () => {
    expect(
      isGenericUserMessage(
        "CanonicalGscSync failed unexpectedly. Please try again or adjust your settings.",
      ),
    ).toBe(true);
    expect(
      isGenericUserMessage("Something went wrong. Please try again later."),
    ).toBe(true);
    expect(isGenericUserMessage("Request failed (500)")).toBe(true);
    expect(isGenericUserMessage("")).toBe(true);
    expect(isGenericUserMessage(null)).toBe(true);
  });

  it("keeps messages that name a cause", () => {
    expect(
      isGenericUserMessage(
        "Google connection 7223 has no vault credential — it needs re-authentication",
      ),
    ).toBe(false);
    expect(
      isGenericUserMessage(
        "Your session has expired. Sign in again, then retry.",
      ),
    ).toBe(false);
  });
});

describe("unwrapUpstreamError", () => {
  it("recovers a stringified upstream payload with its request id and status", () => {
    const upstream = unwrapUpstreamError(GSC_STREAM_ERROR.message);
    expect(upstream).not.toBeNull();
    expect(upstream?.message).toContain("has no vault credential");
    expect(upstream?.code).toBe("conflict");
    expect(upstream?.requestId).toBe("90029a97d75f4401a6f87ac3cafbf148");
    expect(upstream?.status).toBe(409);
  });

  it("returns null when there is no embedded payload", () => {
    expect(unwrapUpstreamError("plain failure with no json")).toBeNull();
    expect(unwrapUpstreamError("almost json {not really}")).toBeNull();
  });
});

describe("describeBackendFailure", () => {
  it("promotes the real cause over the generic stream template", () => {
    const explanation = describeBackendFailure(
      parseStreamError(GSC_STREAM_ERROR),
    );
    expect(explanation.headlineWasGeneric).toBe(true);
    expect(explanation.headline).toContain("needs re-authentication");
    expect(explanation.cause).toContain("has no vault credential");
    expect(explanation.requestId).toBe("90029a97d75f4401a6f87ac3cafbf148");
    expect(explanation.status).toBe(409);
    // The outer layers stay reachable for admin diagnostics.
    expect(explanation.chain[0]).toContain("could not resolve GSC credential");
  });

  it("keeps a specific server user_message as the headline", () => {
    const explanation = describeBackendFailure(
      new BackendApiError({
        code: "admin_required",
        detail: "editor access required for site 38eff4c9",
        userMessage: "You don’t have permission to manage this site.",
        status: 403,
      }),
    );
    expect(explanation.headlineWasGeneric).toBe(false);
    expect(explanation.headline).toBe(
      "You don’t have permission to manage this site.",
    );
    expect(explanation.cause).toBe(
      "You don’t have permission to manage this site.",
    );
    expect(explanation.status).toBe(403);
  });

  it("handles plain errors and non-error throws without losing the text", () => {
    expect(describeBackendFailure(new Error("boom at the edge")).headline).toBe(
      "boom at the edge",
    );
    expect(describeBackendFailure("string failure").cause).toBe(
      "string failure",
    );
    expect(describeBackendFailure(undefined).cause).toBe("Unknown error");
  });

  it("retains request correlation from structured stream details", () => {
    const explanation = describeBackendFailure(
      parseStreamError({
        error_type: "seo_provider_response_error",
        message: "Google Analytics Data API is disabled.",
        user_message: "Google Analytics Data API is disabled.",
        code: "Ga4PartialCollectionError",
        details: { request_id: "request-123", failures: [] },
      }),
    );

    expect(explanation.code).toBe("Ga4PartialCollectionError");
    expect(explanation.requestId).toBe("request-123");
    expect(explanation.headline).toBe("Google Analytics Data API is disabled.");
  });
});

describe("parsePersistedBackendError", () => {
  it("restores the specific provider cause and request id after refresh", () => {
    const error = parsePersistedBackendError(
      {
        type: "Ga4PartialCollectionError",
        message: "1 GA4 request or pagination failure(s)",
        failures: [
          {
            message:
              "GA4 Data API PERMISSION_DENIED: Google Analytics Data API is disabled.",
          },
        ],
      },
      "request-456",
    );

    expect(error?.code).toBe("Ga4PartialCollectionError");
    expect(error?.detail).toContain("Google Analytics Data API is disabled.");
    expect(error?.requestId).toBe("request-456");
  });
});
