/** The Fact Checker tab sends `current_time` — the exact instant, ISO-8601 with offset —
 *  so "recent", "currently" and "new" in a claim are judged against today, not the
 *  model's training cutoff. */
import { isoInstantWithOffset } from "@/lib/dates/isoInstantWithOffset";
import { factCheckVariables } from "../page-analysis-offer-values";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:[+-]\d{2}:\d{2})$/;

describe("isoInstantWithOffset", () => {
  it("names the same instant as toISOString, with the local offset spelled out", () => {
    const now = new Date("2026-09-28T17:04:05.678Z");
    const out = isoInstantWithOffset(now);
    expect(out).toMatch(ISO_WITH_OFFSET);
    expect(new Date(out).getTime()).toBe(now.getTime());
  });
});

describe("factCheckVariables", () => {
  it("sends the page text, the page facts and current_time", () => {
    const now = new Date("2026-09-28T17:04:05.678Z");
    const vars = factCheckVariables("The page text.", { page_title: "T" }, now);
    expect(vars).toEqual({
      page_content: "The page text.",
      page_title: "T",
      current_time: isoInstantWithOffset(now),
    });
    expect(vars.current_time).toMatch(ISO_WITH_OFFSET);
  });

  it("reads the clock at call time when no instant is passed", () => {
    const before = Date.now();
    const vars = factCheckVariables("x");
    expect(new Date(vars.current_time).getTime()).toBeGreaterThanOrEqual(before - 1);
  });
});
