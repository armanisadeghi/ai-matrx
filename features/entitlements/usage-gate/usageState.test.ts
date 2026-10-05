import { parseUsageSnapshot } from "./usageState";

const baseWindow = {
  period: "month",
  limit: 8_000,
  remaining: 6_000,
  resets_at: "2026-11-01T00:00:00Z",
  state: "ok",
};

function snapshotWith(used: unknown) {
  return parseUsageSnapshot({
    state: "ok",
    windows: [{ ...baseWindow, used }],
  });
}

describe("parseUsageSnapshot usage windows", () => {
  // A malformed billing count must remain visibly unmeasured, never look unused.
  it.each([undefined, "not-a-number", Number.NaN])(
    "keeps malformed used %p unknown instead of converting it to zero",
    (used) => {
      expect(snapshotWith(used)?.windows[0]?.used).toBeNull();
    },
  );

  it("preserves a real zero count from billing", () => {
    expect(snapshotWith(0)?.windows[0]?.used).toBe(0);
  });
});
