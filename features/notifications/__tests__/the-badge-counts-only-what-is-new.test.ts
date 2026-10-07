/**
 * THE BADGE RULE (Arman, 2026-10-07): the bell counts only what is new since the person last
 * opened it; opening clears it; the next new thing counts 1 — and a source the person hid never
 * counts. Before this rule the bell summed every unread notice plus every waiting item, so a
 * person with 38 workflows waiting could never reach zero.
 */
import { above, bellBadge, lowerMarks, markAt } from "../badge";

const base = { unseenNeedsYou: 0, unseenDirect: 0, hidden: [] as string[] };

it("counts unseen notices plus what each source gained since the bell was opened", () => {
  expect(bellBadge({ ...base, unseenNeedsYou: 1, unseenDirect: 1, sources: { approvals: 5, work: 3 }, seen: { approvals: 4, work: 3 } })).toBe(3);
});

it("opening the bell takes it to zero, and one new item makes it one", () => {
  const sources = { approvals: 5, work: 38 };
  const seen = markAt({}, sources);
  expect(bellBadge({ ...base, sources, seen })).toBe(0);
  expect(bellBadge({ ...base, sources: { approvals: 6, work: 38 }, seen })).toBe(1);
});

it("a source the person hid never counts", () => {
  expect(bellBadge({ ...base, sources: { work: 38 }, seen: {}, hidden: ["work"] })).toBe(0);
});

it("an unreadable source adds nothing and keeps its mark", () => {
  expect(above(null, 3)).toBe(0);
  expect(markAt({ work: 3 }, { work: null })).toEqual({ work: 3 });
});

it("items handled elsewhere lower the mark, so the next new one counts", () => {
  const lowered = lowerMarks({ work: 38 }, { work: 30 });
  expect(lowered).toEqual({ work: 30 });
  expect(bellBadge({ ...base, sources: { work: 31 }, seen: lowered ?? {} })).toBe(1);
  expect(lowerMarks({ work: 30 }, { work: 31 })).toBeNull();
});
