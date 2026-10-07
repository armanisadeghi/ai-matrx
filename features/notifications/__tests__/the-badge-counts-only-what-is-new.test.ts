/**
 * THE BADGE RULE (Arman, 2026-10-07): the bell counts only what is new since the person last
 * opened it; opening clears it; the next new thing counts 1 — and a place the person hid never
 * counts. Marks move only on open/clear (review, 2026-10-07): a refetch that briefly reads low
 * never makes the real items come back as "new", and a place with ids is compared by id.
 */
import { bellBadge, markPlaces, newIn, NO_MARKS, type PlaceReading } from "../badge";

const base = { unseenNeedsYou: 0, unseenDirect: 0, hidden: [] as string[] };

it("counts unseen notices plus what each place gained since the bell was opened", () => {
  const seen = { counts: { approvals: 4, work: 3 }, ids: {} };
  expect(bellBadge({ ...base, unseenNeedsYou: 1, unseenDirect: 1, places: { approvals: { count: 5 }, work: { count: 3 } }, seen })).toBe(3);
});

it("opening the bell takes it to zero, and one new item makes it one", () => {
  const places = { approvals: { count: 5 }, work: { count: 38 } };
  const seen = markPlaces(NO_MARKS, places);
  expect(bellBadge({ ...base, places, seen })).toBe(0);
  expect(bellBadge({ ...base, places: { approvals: { count: 6 }, work: { count: 38 } }, seen })).toBe(1);
});

it("a place the person hid never counts", () => {
  expect(bellBadge({ ...base, places: { work: { count: 38 } }, seen: NO_MARKS, hidden: ["work"] })).toBe(0);
});

it("a refetch that briefly reads low changes no mark, so the real count is not 'new' again", () => {
  const seen = markPlaces(NO_MARKS, { work: { count: 38 } });
  // A transient low read: nothing new, and nothing written (only markPlaces moves a mark).
  expect(bellBadge({ ...base, places: { work: { count: 2 } }, seen })).toBe(0);
  // The real count comes back: still nothing new.
  expect(bellBadge({ ...base, places: { work: { count: 38 } }, seen })).toBe(0);
});

it("by id: one handled and one new shows 1", () => {
  const before: PlaceReading = { count: 2, ids: ["run-a", "run-b"] };
  const cleared = markPlaces(NO_MARKS, { workflows: before });
  expect(newIn("workflows", { count: 2, ids: ["run-b", "run-c"] }, cleared)).toBe(1);
});

it("an unreadable place adds nothing and keeps its mark", () => {
  expect(newIn("work", { count: null }, NO_MARKS)).toBe(0);
  expect(markPlaces({ counts: { work: 3 }, ids: {} }, { work: { count: null } }).counts).toEqual({ work: 3 });
});
