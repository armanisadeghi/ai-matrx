/** @jest-environment node */

/**
 * A DROPPED SOCKET IS NOT A BAD PASSWORD.
 *
 * The lane-visible defect was `{"error":"OTP fallback failed: fetch failed"}`
 * on the shared dev server: a transport failure, reported as the second call's
 * problem, never retried, and with its `cause` already thrown away by
 * `@supabase/auth-js` (`AuthRetryableFetchError(e.message, 0)` keeps the
 * message and drops the cause). Lanes read it as a product defect and stopped.
 *
 * Every clause below fails against the pre-2026-09-21 route, which had no
 * retry, no cause chain and one branch for both kinds of failure.
 */

import {
  describeFailure,
  formatAttempts,
  isTransportFailure,
  retryTransport,
  tracingFetch,
  type TransportAttempt,
} from "./authTransport";

/** What `@supabase/auth-js` hands back when the fetch itself never completed. */
function retryableFetchError(message = "fetch failed") {
  const error = new Error(message);
  error.name = "AuthRetryableFetchError";
  (error as unknown as { status: number }).status = 0;
  return error;
}

/** What it hands back when the auth host ANSWERED and said no. */
function credentialError(message = "Invalid login credentials") {
  const error = new Error(message);
  error.name = "AuthApiError";
  (error as unknown as { status: number }).status = 400;
  return error;
}

/** The real undici shape, one frame before auth-js flattens it. */
function undiciSocketError() {
  const cause = new Error("other side closed");
  cause.name = "SocketError";
  (cause as unknown as { code: string }).code = "UND_ERR_SOCKET";
  return new TypeError("fetch failed", { cause });
}

const noSleep = async () => {};

describe("telling a transport failure apart from a refusal", () => {
  it("calls auth-js's own retryable fetch error transport", () => {
    expect(isTransportFailure(retryableFetchError())).toBe(true);
  });

  it("calls a wrong password NOT transport — it must never be retried or excused", () => {
    // Retrying a refusal is how a test account gets rate-limited, and
    // excusing it is how a genuinely drifted AI_ADMIN_PASSWORD goes unnoticed.
    expect(isTransportFailure(credentialError())).toBe(false);
  });

  it("sees through a raw undici socket error and its cause chain", () => {
    expect(isTransportFailure(undiciSocketError())).toBe(true);
  });

  it("treats a 5xx from the edge as transport and a 400 as an answer", () => {
    expect(isTransportFailure({ status: 502, message: "Bad Gateway" })).toBe(true);
    expect(isTransportFailure({ status: 400, message: "nope" })).toBe(false);
  });
});

describe("the reason a lane reads is the real one", () => {
  it("flattens the whole cause chain, not just the useless top line", () => {
    const described = describeFailure(undiciSocketError());
    expect(described).toContain("fetch failed");
    // THE DEFECT: "fetch failed" alone named nothing. The cause does.
    expect(described).toContain("other side closed");
    expect(described).toContain("UND_ERR_SOCKET");
  });

  it("does not loop forever on an error that causes itself", () => {
    const loop = new Error("round and round") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(describeFailure(loop)).toBe("Error: round and round");
  });

  it("tracingFetch records the cause BEFORE anything downstream flattens it", async () => {
    const log: TransportAttempt[] = [];
    const failing = tracingFetch("generateLink", log, (async () => {
      throw undiciSocketError();
    }) as unknown as typeof fetch);

    await expect(failing("https://example.invalid")).rejects.toThrow("fetch failed");
    expect(log).toHaveLength(1);
    expect(log[0].reason).toContain("UND_ERR_SOCKET");
  });
});

describe("a transport failure is retried; a refusal is not", () => {
  it("recovers when the second attempt goes through, and says it had to", async () => {
    const log: TransportAttempt[] = [];
    const call = jest
      .fn()
      .mockResolvedValueOnce({ error: retryableFetchError() })
      .mockResolvedValueOnce({ error: null });

    const outcome = await retryTransport("signInWithPassword", call, log, {
      sleep: noSleep,
    });

    expect(outcome.error).toBeNull();
    expect(call).toHaveBeenCalledTimes(2);
    // A recovered blip is still VISIBLE — nothing fails, or recovers, silently.
    expect(formatAttempts(log)).toContain("fetch failed");
    expect(formatAttempts(log)).toContain("recovered");
  });

  it("stops at the first refusal instead of hammering the auth host", async () => {
    const log: TransportAttempt[] = [];
    const call = jest.fn().mockResolvedValue({ error: credentialError() });

    const outcome = await retryTransport("signInWithPassword", call, log, {
      sleep: noSleep,
    });

    expect(call).toHaveBeenCalledTimes(1);
    expect((outcome.error as Error).name).toBe("AuthApiError");
  });

  it("gives up after the configured attempts and keeps every one of them", async () => {
    const log: TransportAttempt[] = [];
    const call = jest.fn().mockResolvedValue({ error: retryableFetchError() });

    await retryTransport("generateLink", call, log, { attempts: 3, sleep: noSleep });

    expect(call).toHaveBeenCalledTimes(3);
    expect(log).toHaveLength(3);
    expect(log.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it("treats a THROW the same as an { error } — some clients throw", async () => {
    const log: TransportAttempt[] = [];
    const call = jest
      .fn()
      .mockRejectedValueOnce(undiciSocketError())
      .mockResolvedValueOnce({ error: null });

    const outcome = await retryTransport("verifyOtp", call, log, { sleep: noSleep });

    expect(outcome.error).toBeNull();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("leaves the log untouched when the very first attempt works", async () => {
    const log: TransportAttempt[] = [];
    await retryTransport("signInWithPassword", async () => ({ error: null }), log);
    expect(log).toHaveLength(0);
  });
});
