import { freePeriodNoticeFor } from "../freePeriodNotice";

const NOW = new Date("2026-10-04T12:00:00Z");
const fp = (status: "active" | "ended", endsAt: string) => ({ status, planKey: "pro", endsAt, daysLeft: null, source: "coupon" });

describe("free period notice", () => {
  it("is silent outside the warning window", () => {
    expect(freePeriodNoticeFor(fp("active", "2026-11-30T12:00:00Z"), 14, NOW)).toBeNull();
  });
  it("reminds inside the window, keyed once per day", () => {
    const n = freePeriodNoticeFor(fp("active", "2026-10-07T12:00:00Z"), 14, NOW);
    expect(n?.kind).toBe("ending");
    expect(n?.title).toMatch(/^Your free Pro ends Oct 7, 2026 — choose a plan$/);
    expect(n?.dayKey).toContain("2026-10-04");
  });
  it("prompts a plan once ended; nothing for null or undated", () => {
    expect(freePeriodNoticeFor(fp("ended", "2026-10-01T12:00:00Z"), 14, NOW)?.kind).toBe("ended");
    expect(freePeriodNoticeFor(null, 14, NOW)).toBeNull();
    expect(freePeriodNoticeFor({ ...fp("active", ""), endsAt: null }, 14, NOW)).toBeNull();
  });
});
