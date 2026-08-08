import {
  latestDismissal,
  parseDismissals,
} from "@/features/marketing/lib/dismissals";

describe("parseDismissals — metadata.dismissals narrower", () => {
  it("returns empty for absent, null, or non-record metadata", () => {
    expect(parseDismissals(null)).toEqual([]);
    expect(parseDismissals("noise")).toEqual([]);
    expect(parseDismissals({})).toEqual([]);
    expect(parseDismissals({ dismissals: "not-an-array" })).toEqual([]);
  });

  it("parses server-stamped records and drops malformed entries", () => {
    const records = parseDismissals({
      dismissals: [
        {
          dismissed_at: "2026-08-01T00:00:00Z",
          revived_at: "2026-08-05T00:00:00Z",
          revive_reason: "sitemap_sync",
        },
        "garbage",
        { dismissed_at: 42, revived_at: "", revive_reason: null },
      ],
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      dismissed_at: "2026-08-01T00:00:00Z",
      revived_at: "2026-08-05T00:00:00Z",
      revive_reason: "sitemap_sync",
    });
    // Wrong-typed and empty-string fields become null, never crash.
    expect(records[1]).toEqual({
      dismissed_at: null,
      revived_at: null,
      revive_reason: null,
    });
  });

  it("latestDismissal returns the last appended cycle", () => {
    expect(latestDismissal([])).toBeNull();
    const records = parseDismissals({
      dismissals: [
        { dismissed_at: "2026-07-01T00:00:00Z", revived_at: null },
        { dismissed_at: "2026-08-01T00:00:00Z", revived_at: null },
      ],
    });
    expect(latestDismissal(records)?.dismissed_at).toBe(
      "2026-08-01T00:00:00Z",
    );
  });
});
