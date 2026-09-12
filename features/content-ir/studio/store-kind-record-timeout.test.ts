/**
 * DD-131 slice 1 residual (V-45 §3.3): "A save that never finished, and never
 * said so."
 *
 * Observed live: the DB/gateway returned an intermittent 504 during a client
 * save. The Test tab's button sat on "Saving…" for 11+ seconds with no error,
 * no toast, and no row ever written — a person would have walked away
 * believing it saved. THE ONE CLIENT STORE (`storeKindRecord`) is the single
 * choke point every client save path routes through (the chat block's
 * "Save this Wine Tasting", "Save to my Shapes", and the Shape Studio's Test
 * tab), so the bound belongs there once, not copied into every caller.
 *
 * This test mocks ONLY the network boundary (`./instance-service`) with a
 * promise that NEVER resolves — exactly a hung request — and proves
 * `storeKindRecord` still rejects, with a human sentence, inside
 * `SAVE_TIMEOUT_MS`. Fake timers stand in for the wall clock; nothing here
 * fakes `storeKindRecord`'s own logic.
 */

jest.mock("./instance-service", () => ({
  saveKindInstance: jest.fn(() => new Promise(() => {})), // never settles — the 504 hang
}));

jest.mock("@/features/content-ir/records/record-change-bus", () => ({
  notifyKindRecordsChanged: jest.fn(),
}));

import { SAVE_TIMEOUT_MS, storeKindRecord } from "./store-kind-record";

describe("V-45 §3.3: a hung save times out with a named refusal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects within SAVE_TIMEOUT_MS instead of hanging forever, with a remedy sentence", async () => {
    const pending = storeKindRecord({
      kindDefinitionId: "def-1",
      kindVersion: 1,
      value: { vintage: 2018 },
      organizationId: "org-1",
    });

    // Swallow the eventual rejection so Node doesn't report it as unhandled
    // before the assertion below attaches its own handler.
    const outcome = pending.then(
      () => ({ settled: "resolved" as const }),
      (error: unknown) => ({ settled: "rejected" as const, error }),
    );

    // Well short of the bound: still hanging, exactly the 11+s the live
    // incident showed with no verdict yet.
    await jest.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1_000);
    let result = await Promise.race([
      outcome,
      Promise.resolve({ settled: "still-pending" as const }),
    ]);
    expect(result.settled).toBe("still-pending");

    // Past the bound: the save must have refused itself by now.
    await jest.advanceTimersByTimeAsync(2_000);
    result = await outcome;
    expect(result.settled).toBe("rejected");
    if (result.settled === "rejected") {
      const message =
        result.error instanceof Error ? result.error.message : String(result.error);
      expect(message).toMatch(/did not finish within 20 seconds/);
      expect(message).toMatch(/check your connection and try again/i);
    }
  });
});
