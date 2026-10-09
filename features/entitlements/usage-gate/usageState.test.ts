import { parseUsageSnapshot, resetSubject } from "./usageState";

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

describe("resetSubject — the usage notice names the window it resets", () => {
  it("names each window, so two loads with different binding windows never read as two dates for one limit", () => {
    expect(resetSubject("week")).toBe("Weekly limit");
    expect(resetSubject("month")).toBe("Monthly limit");
    expect(resetSubject("day")).toBe("Daily limit");
    expect(resetSubject("rolling_5h")).toBe("5-hour limit");
    expect(resetSubject(null)).toBe("Limit");
  });
});
