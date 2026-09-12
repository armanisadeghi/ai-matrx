import { timestamp } from "./format";

describe("spend timestamp", () => {
  it("uses a compact numeric date and keeps date and time on one line", () => {
    expect(timestamp("2026-09-11T17:23:00")).toBe(
      "09/11/26\u00a0·\u00a05:23\u00a0PM",
    );
  });

  it("keeps missing and invalid values honest", () => {
    expect(timestamp(null)).toBe("never");
    expect(timestamp("not-a-date")).toBe("never");
  });
});
