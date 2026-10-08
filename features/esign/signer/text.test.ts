import { lockedNotice } from "./text";

describe("lockedNotice (verify A5)", () => {
  it("names the lock and the time it reopens — never the dead-link sentence", () => {
    const text = lockedNotice("2026-10-08T16:52:01Z", "en-US");
    expect(text).toMatch(/^Too many tries\. This link is locked until \d{1,2}:\d{2}/);
    expect(text).not.toMatch(/no longer valid/);
  });
  it("still says it is locked when no time came back", () => {
    expect(lockedNotice(null)).toBe("Too many tries. Wait a few minutes, then try again.");
    expect(lockedNotice("not a date")).toBe("Too many tries. Wait a few minutes, then try again.");
  });
});
