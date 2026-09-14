/**
 * The content-ir session-ready seam is the SAME signal as the platform barrier
 * (DD-215b → DD-237).
 *
 * `component-registry.ts` and `kindComponentIncident.ts` retry a refused read
 * through `hasSession()` / `whenSessionReady()`. When DD-237 shipped the real
 * barrier, this module stopped owning a second `onAuthStateChange` subscription
 * and became the content-ir name for `utils/supabase/sessionBarrier`. These
 * tests hold that adapter to the contract its consumers were written against —
 * the tri-state, the one-shot drain, the unsubscribe, and both test seams — so
 * the repoint cannot quietly change what a refused read waits on.
 *
 * Deliberately free of `@ai-matrx/content-ir` imports: this is a signal test,
 * and it must be runnable without the render stack.
 */

import {
  announceSessionForTests,
  hasSession,
  resetSessionReadyForTests,
  whenSessionReady,
} from "./session-ready";
import {
  announceSessionForTests as announceOnTheBarrier,
  hasAttachedSession,
} from "@/utils/supabase/sessionBarrier";

beforeEach(() => {
  resetSessionReadyForTests();
});

describe("the content-ir seam is the platform barrier", () => {
  it("reports no session until auth has said there is one", () => {
    expect(hasSession()).toBe(false); // "not proven", never "signed out"
    announceSessionForTests(true);
    expect(hasSession()).toBe(true);
  });

  it("reads the SAME signal the barrier holds — not a second subscription", () => {
    announceOnTheBarrier(true);
    expect(hasSession()).toBe(true);
    expect(hasAttachedSession()).toBe(true);

    announceOnTheBarrier(false);
    expect(hasSession()).toBe(false);
  });

  it("runs a waiting listener once, when the session lands", () => {
    const calls: string[] = [];
    whenSessionReady(() => calls.push("fired"));
    expect(calls).toEqual([]);

    announceSessionForTests(true);
    expect(calls).toEqual(["fired"]);

    // One-shot on purpose: a listener that re-fired on every token refresh
    // would turn one refusal into a standing poll.
    announceSessionForTests(false);
    announceSessionForTests(true);
    expect(calls).toEqual(["fired"]);
  });

  it("runs the listener immediately when a session already exists", () => {
    announceSessionForTests(true);
    const calls: string[] = [];
    whenSessionReady(() => calls.push("fired"));
    expect(calls).toEqual(["fired"]);
  });

  it("honours the unsubscribe returned for the not-yet case", () => {
    const calls: string[] = [];
    const unsubscribe = whenSessionReady(() => calls.push("fired"));
    unsubscribe();
    announceSessionForTests(true);
    expect(calls).toEqual([]);
  });

  it("resets to the unheard-from state, and can be seeded", () => {
    announceSessionForTests(true);
    resetSessionReadyForTests();
    expect(hasSession()).toBe(false);

    resetSessionReadyForTests(true);
    expect(hasSession()).toBe(true);
  });

  it("never lets one bad listener stop the others", () => {
    const calls: string[] = [];
    whenSessionReady(() => {
      throw new Error("a consumer's callback threw");
    });
    whenSessionReady(() => calls.push("second"));
    announceSessionForTests(true);
    expect(calls).toEqual(["second"]);
  });
});
