/**
 * Guard for the D183 defect-2 contract: a dropped socket on a durable,
 * server-orchestrated run reattaches instead of dead-ending.
 *
 * What must never regress:
 *   - a transport loss triggers a bounded rejoin loop (not a one-shot, not
 *     unbounded);
 *   - a successful rejoin stops the loop immediately;
 *   - `cancel()` (unmount / new logical run) stops it even mid-backoff, so a
 *     reattach can never rejoin into a dead surface or a superseded run.
 */

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}));

import { createTransportLossReattacher } from "../reattach-on-transport-loss";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
    jest.advanceTimersByTime(0);
  }
};

/** Run all pending timers + microtasks until the loop settles. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) {
    jest.runOnlyPendingTimers();
    await flush();
  }
};

describe("createTransportLossReattacher", () => {
  let warn: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    warn.mockRestore();
    errorLog.mockRestore();
  });

  it("rejoins the durable run after the transport drops", async () => {
    const rejoin = jest.fn().mockResolvedValue(undefined);
    const reattacher = createTransportLossReattacher({
      label: "keyword research",
      rejoin,
      baseDelayMs: 1_000,
    });

    reattacher.onTransportLost();
    await settle();

    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(rejoin).toHaveBeenCalledWith(1);
  });

  it("retries a failing rejoin and stops the moment one succeeds", async () => {
    const rejoin = jest
      .fn()
      .mockRejectedValueOnce(new Error("still down"))
      .mockResolvedValueOnce(undefined);
    const reattacher = createTransportLossReattacher({
      label: "keyword research",
      rejoin,
      baseDelayMs: 1_000,
      maxAttempts: 4,
    });

    reattacher.onTransportLost();
    await settle();

    expect(rejoin).toHaveBeenCalledTimes(2);
  });

  it("gives up loudly after maxAttempts rather than retrying forever", async () => {
    const rejoin = jest.fn().mockRejectedValue(new Error("still down"));
    const reattacher = createTransportLossReattacher({
      label: "keyword research",
      rejoin,
      baseDelayMs: 1_000,
      maxAttempts: 3,
    });

    reattacher.onTransportLost();
    await settle();

    expect(rejoin).toHaveBeenCalledTimes(3);
    expect(errorLog).toHaveBeenCalled();
  });

  it("cancel() stops a reattach that has not fired yet", async () => {
    const rejoin = jest.fn().mockResolvedValue(undefined);
    const reattacher = createTransportLossReattacher({
      label: "keyword research",
      rejoin,
      baseDelayMs: 5_000,
    });

    reattacher.onTransportLost();
    await flush();
    reattacher.cancel();
    await settle();

    expect(rejoin).not.toHaveBeenCalled();
  });

  it("does not start a second loop while one is already running", async () => {
    const rejoin = jest.fn().mockResolvedValue(undefined);
    const reattacher = createTransportLossReattacher({
      label: "keyword research",
      rejoin,
      baseDelayMs: 1_000,
    });

    reattacher.onTransportLost();
    reattacher.onTransportLost();
    reattacher.onTransportLost();
    await settle();

    expect(rejoin).toHaveBeenCalledTimes(1);
  });
});
