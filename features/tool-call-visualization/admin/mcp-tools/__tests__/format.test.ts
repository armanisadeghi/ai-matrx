import { formatToolTimestamp } from "../format";

describe("formatToolTimestamp", () => {
  it("formats valid timestamps deterministically in UTC", () => {
    expect(formatToolTimestamp("2026-08-22T05:44:51.151335Z")).toBe(
      "2026-08-22 05:44:51",
    );
  });

  it("preserves invalid values and renders missing values as empty", () => {
    expect(formatToolTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatToolTimestamp(null)).toBe("");
  });
});
