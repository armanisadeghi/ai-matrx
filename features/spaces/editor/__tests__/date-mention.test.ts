/** N2 — "@today", "@tomorrow", "@<date>": what the "@" menu's Date group offers and how a date reads. */
import { dateChoices, dateWords, parseTypedDate } from "../date-mention";

const now = new Date(2026, 9, 7, 15, 30); // Oct 7 2026, afternoon

describe("date mentions", () => {
  it("offers Today, Tomorrow, Yesterday for an empty '@' and filters by what is typed", () => {
    expect(dateChoices("", now).map((c) => c.title)).toEqual(["Today", "Tomorrow", "Yesterday"]);
    expect(dateChoices("tom", now)).toEqual([{ title: "Tomorrow", iso: "2026-10-08" }]);
  });
  it("reads typed dates in the usual spellings", () => {
    for (const q of ["2026-10-12", "10/12", "oct 12", "October 12 2026", "12 oct"]) expect(dateChoices(q, now)).toEqual([{ title: "October 12, 2026", iso: "2026-10-12" }]);
    expect(parseTypedDate("feb 30", now)).toBeNull();
    expect(parseTypedDate("hello", now)).toBeNull();
  });
  it("reads relative words for the days around today", () => {
    expect(dateWords("2026-10-07", now)).toBe("Today");
    expect(dateWords("2026-10-08", now)).toBe("Tomorrow");
    expect(dateWords("2026-10-06", now)).toBe("Yesterday");
  });
});
