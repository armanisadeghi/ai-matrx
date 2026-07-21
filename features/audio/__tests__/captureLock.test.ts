/**
 * captureLock unit tests — the app-wide single-capture arbiter.
 * Start-always-wins takeover (previous holder's stop() runs synchronously),
 * id-guarded release, same-id re-claim (no self-stop), and subscription.
 */

import {
  claimCapture,
  getActiveCaptureId,
  isCaptureActive,
  releaseCapture,
  subscribeCapture,
  type CaptureHolder,
} from "@/features/audio/captureLock";

function holder(id: string, stop: () => void = () => {}): CaptureHolder {
  return { id, stop };
}

afterEach(() => {
  // Drain any leftover owner so tests stay independent.
  const active = getActiveCaptureId();
  if (active) releaseCapture(active);
});

describe("captureLock", () => {
  it("claim takes ownership; release clears it", () => {
    claimCapture(holder("a"));
    expect(getActiveCaptureId()).toBe("a");
    expect(isCaptureActive()).toBe(true);
    releaseCapture("a");
    expect(getActiveCaptureId()).toBeNull();
    expect(isCaptureActive()).toBe(false);
  });

  it("start-always-wins: a new claim synchronously stops the prior holder", () => {
    const stopA = jest.fn(() => {
      // At stop time the lock must already be clear of the old owner —
      // a re-entrant read can never see a stale owner.
      expect(getActiveCaptureId()).not.toBe("a");
    });
    claimCapture(holder("a", stopA));
    claimCapture(holder("b"));
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(getActiveCaptureId()).toBe("b");
  });

  it("re-claiming with the SAME id does not stop the holder", () => {
    const stop = jest.fn();
    claimCapture(holder("a", stop));
    claimCapture(holder("a", stop));
    expect(stop).not.toHaveBeenCalled();
    expect(getActiveCaptureId()).toBe("a");
  });

  it("release is id-guarded: a stale release after takeover is a no-op", () => {
    claimCapture(holder("a"));
    claimCapture(holder("b"));
    releaseCapture("a"); // late release from the ousted holder
    expect(getActiveCaptureId()).toBe("b");
  });

  it("a throwing stop() does not break the takeover", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    claimCapture(
      holder("a", () => {
        throw new Error("boom");
      }),
    );
    claimCapture(holder("b"));
    expect(getActiveCaptureId()).toBe("b");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("subscribers hear claims and releases", () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeCapture((h) => seen.push(h?.id ?? null));
    claimCapture(holder("a"));
    claimCapture(holder("b"));
    releaseCapture("b");
    expect(seen).toEqual(["a", "b", null]);
    unsub();
    claimCapture(holder("c"));
    expect(seen).toEqual(["a", "b", null]);
  });
});
