/**
 * A retry card never claims a retry that is not happening.
 *
 * 2026-10-01: an OpenAI-backed shortcut failed after its retries; the window
 * kept "Openai is busy · Retry 2 of 2" (state `scheduled`) beside the failed
 * answer, and titled an unknown error "busy". Once the stream ends only the
 * terminal retry outcomes stay on screen; the turn's own error owns it.
 */
import type { ProviderRetryPayload } from "@/types/python-generated/stream-events";
import { shouldShowProviderRetry, statusCopy } from "../ProviderRetryCard";

function retry(
  state: ProviderRetryPayload["state"],
  error_type = "unknown_error",
): ProviderRetryPayload {
  return {
    state,
    provider: "openai",
    error_type,
    message: "upstream failure",
    user_message: "An unexpected OpenAI error occurred.",
    iteration: 1,
    failed_attempt: 2,
    next_attempt: 3,
    max_retries: 2,
  } as ProviderRetryPayload;
}

describe("provider retry card truth", () => {
  it("hides an in-flight retry once the stream has ended", () => {
    expect(shouldShowProviderRetry(retry("scheduled"), false)).toBe(false);
    expect(shouldShowProviderRetry(retry("retrying_now"), false)).toBe(false);
    expect(shouldShowProviderRetry(retry("recovered"), false)).toBe(false);
  });

  it("keeps terminal retry outcomes after the stream", () => {
    expect(shouldShowProviderRetry(retry("suspended"), false)).toBe(true);
    expect(shouldShowProviderRetry(retry("cancelled"), false)).toBe(true);
  });

  it("shows every state while the stream is live", () => {
    for (const state of ["scheduled", "retrying_now", "recovered"] as const) {
      expect(shouldShowProviderRetry(retry(state), true)).toBe(true);
    }
    expect(shouldShowProviderRetry(null, true)).toBe(false);
  });

  it("calls a provider busy only for capacity errors", () => {
    expect(statusCopy(retry("scheduled", "provider_overloaded")).title).toBe("Openai is busy");
    expect(statusCopy(retry("scheduled", "rate_limit")).title).toBe("Openai is busy");
    expect(statusCopy(retry("scheduled", "unknown_error")).title).toBe("Openai hit an error");
  });
});
