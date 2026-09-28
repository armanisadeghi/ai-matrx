import {
  parseFreeBusy,
  parseWorkingDays,
  suggestSlots,
  type SlotOptions,
} from "@/features/meet/lib/find-time";

const LA = "America/Los_Angeles";
// Monday 2026-09-28, 08:00 in Los Angeles (15:00 UTC).
const MONDAY_8AM = new Date("2026-09-28T15:00:00Z");

function options(extra: Partial<SlotOptions> = {}): SlotOptions {
  return {
    zone: LA,
    durationMinutes: 30,
    stepMinutes: 30,
    count: 3,
    horizonDays: 14,
    hours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
    now: MONDAY_8AM,
    ...extra,
  };
}

describe("suggestSlots", () => {
  it("offers the first open half hours of the working day, in the meeting's zone", () => {
    const slots = suggestSlots([], options());
    expect(slots.map((s) => `${s.date} ${s.time}`)).toEqual([
      "2026-09-28 09:00",
      "2026-09-28 09:30",
      "2026-09-28 10:00",
    ]);
    expect(slots[0]!.start).toBe("2026-09-28T16:00:00.000Z");
  });

  it("skips any slot where anyone is busy for part of the meeting", () => {
    const busy = [
      // someone busy 09:00–09:45 LA; another 10:00–10:30 LA
      { userId: "a", start: Date.parse("2026-09-28T16:00:00Z"), end: Date.parse("2026-09-28T16:45:00Z") },
      { userId: "b", start: Date.parse("2026-09-28T17:00:00Z"), end: Date.parse("2026-09-28T17:30:00Z") },
    ];
    const slots = suggestSlots(busy, options());
    expect(slots.map((s) => s.time)).toEqual(["10:30", "11:00", "11:30"]);
  });

  it("never offers a slot that runs past the end of the working day or on a weekend", () => {
    const friday4pm = new Date("2026-10-02T23:00:00Z"); // 16:00 LA Friday
    const slots = suggestSlots([], options({ now: friday4pm, durationMinutes: 60, count: 1 }));
    expect(slots[0]!.date).toBe("2026-10-05"); // Monday, not Friday 16:30 or Saturday
    expect(slots[0]!.time).toBe("09:00");
  });

  it("returns nothing rather than inventing a slot when the horizon is full", () => {
    const allWeek = [{ userId: "a", start: 0, end: Date.parse("2027-01-01T00:00:00Z") }];
    expect(suggestSlots(allWeek, options())).toEqual([]);
  });
});

describe("parsers", () => {
  it("reads the working-days knob and falls back to Monday–Friday", () => {
    expect(parseWorkingDays("1, 3,5")).toEqual([1, 3, 5]);
    expect(parseWorkingDays("nonsense")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDays(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps only well-formed free/busy rows", () => {
    const parsed = parseFreeBusy({
      users: [{ user_id: "u1", visible: true, calendar_connected: false }, { nope: 1 }],
      busy: [
        { user_id: "u1", starts_at: "2026-09-28T16:00:00Z", ends_at: "2026-09-28T17:00:00Z" },
        { user_id: "u1", starts_at: "bad", ends_at: "2026-09-28T17:00:00Z" },
      ],
    });
    expect(parsed.people).toEqual([{ userId: "u1", visible: true, calendarConnected: false }]);
    expect(parsed.busy).toHaveLength(1);
  });
});
