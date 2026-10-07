import { createInactivityWatchdog } from "../inactivity";

describe("createInactivityWatchdog", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("aborts after idle silence", () => {
    const w = createInactivityWatchdog(90_000, 900_000);
    jest.advanceTimersByTime(90_001);
    expect(w.signal.aborted).toBe(true);
    expect(w.timeoutReason).toBe("idle");
  });

  it("heartbeats keep it alive until the hard max, then it aborts", () => {
    const w = createInactivityWatchdog(90_000, 15 * 60_000);
    for (let t = 0; t < 14 * 60_000; t += 30_000) {
      jest.advanceTimersByTime(30_000);
      w.bump();
    }
    expect(w.signal.aborted).toBe(false);
    for (let t = 0; t < 2 * 60_000; t += 30_000) {
      jest.advanceTimersByTime(30_000);
      w.bump();
    }
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(true);
    expect(w.timeoutReason).toBe("max");
  });

  it("dispose clears both timers", () => {
    const w = createInactivityWatchdog(1000, 2000);
    w.dispose();
    jest.advanceTimersByTime(10_000);
    expect(w.signal.aborted).toBe(false);
  });
});
