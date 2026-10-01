// The review opens by itself once per set of Sources — never again on a
// reload, a remount or "Try again" of the same set (verify-6 #4, 2026-10-01).
import { reviewSetKey, shouldAutoOpenReview } from "./reviewAutoOpen";

const big = { totalChars: 138_000, threshold: 100_000 };

describe("shouldAutoOpenReview", () => {
  it("opens once for a large set", () => {
    const setKey = reviewSetKey(["processed_document:a", "file:b"]);
    expect(shouldAutoOpenReview({ ...big, setKey, openedFor: null })).toBe(true);
  });

  it("does not reopen after a reload of the same set (the order the cards come back in does not matter)", () => {
    const openedFor = reviewSetKey(["processed_document:a", "file:b"]);
    const afterReload = reviewSetKey(["file:b", "processed_document:a"]);
    expect(shouldAutoOpenReview({ ...big, setKey: afterReload, openedFor })).toBe(false);
  });

  it("opens again when the set changes", () => {
    const openedFor = reviewSetKey(["processed_document:a"]);
    const grown = reviewSetKey(["processed_document:a", "file:c"]);
    expect(shouldAutoOpenReview({ ...big, setKey: grown, openedFor })).toBe(true);
  });

  it("stays shut below the knob, before the knob is read, and with no Sources", () => {
    const setKey = reviewSetKey(["processed_document:a"]);
    expect(shouldAutoOpenReview({ totalChars: 5_000, threshold: 100_000, setKey, openedFor: null })).toBe(false);
    expect(shouldAutoOpenReview({ totalChars: 500_000, threshold: null, setKey, openedFor: null })).toBe(false);
    expect(shouldAutoOpenReview({ ...big, setKey: reviewSetKey([]), openedFor: null })).toBe(false);
  });
});
