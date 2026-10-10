jest.mock("@/features/meet/hooks/useMeetingsDirectory", () => ({ useMeetingsDirectory: () => null }));
import { collapseSeries, pickTodaysOccurrences } from "../bodies/AgendaWidget";

const now = new Date(2026, 9, 9, 10, 0);
const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m).toISOString();
const occ = (id: string, start: string, title = "Weekly product sync") => ({
  meetingId: id, occurrenceStart: start, title, meetingCancelled: false, state: "scheduled", hostUserId: "h1",
});

it("six same-named meetings today collapse to the next one, with the count (the live 2026-10-09 data)", () => {
  const six = [occ("a", at(5, 47)), occ("b", at(6, 22)), occ("c", at(7, 53)), occ("d", at(8, 14)), occ("e", at(11, 16)), occ("f", at(13, 39))];
  const rows = collapseSeries(pickTodaysOccurrences(six, now), now);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ meetingId: "e", count: 6 });
});

it("different meetings stay separate; a series all in the past shows its last", () => {
  const rows = collapseSeries([occ("a", at(8)), occ("b", at(9)), occ("c", at(12), "1:1 with Dana")], now);
  expect(rows.map((r) => [r.meetingId, r.count])).toEqual([["b", 2], ["c", 1]]);
});

it("tomorrow and cancelled occurrences are not today's", () => {
  const tomorrow = new Date(2026, 9, 10, 9).toISOString();
  expect(pickTodaysOccurrences([occ("a", tomorrow), { ...occ("b", at(11)), meetingCancelled: true }], now)).toEqual([]);
});
