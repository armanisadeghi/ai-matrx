import {
  NO_REPEAT,
  buildRrule,
  describeRecurrence,
  parseRrule,
  repeatPresets,
  weekOfMonth,
  type RecurrenceSpec,
} from "./recurrence";
import { utcToZoned } from "./zoned-time";

// Tuesday October 6 2026, 10:00 in Los Angeles (17:00 UTC).
const tuesday = utcToZoned("2026-10-06T17:00:00.000Z", "America/Los_Angeles");
// Monday 17:00 in Los Angeles is TUESDAY 00:00 UTC — the rule must say Monday.
const lateMonday = utcToZoned(
  "2026-10-06T00:00:00.000Z",
  "America/Los_Angeles",
);

const weekly: RecurrenceSpec = {
  frequency: "weekly",
  interval: 1,
  weekdays: [],
  monthlyMode: "day-of-month",
  ends: { kind: "never" },
};

describe("the repeat editor writes the rule the database expands", () => {
  it("does not repeat → no rule", () => {
    expect(buildRrule(NO_REPEAT, tuesday)).toBeNull();
  });

  it("weekly with no chips chosen = the start's own weekday, read in the meeting's zone", () => {
    expect(buildRrule(weekly, tuesday)).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(buildRrule(weekly, lateMonday)).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("weekday chips are written Monday-first, every N weeks", () => {
    expect(
      buildRrule(
        { ...weekly, interval: 2, weekdays: ["SU", "WE", "MO"] },
        tuesday,
      ),
    ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,SU");
  });

  it("daily, ending after N times", () => {
    expect(
      buildRrule(
        { ...weekly, frequency: "daily", ends: { kind: "after", count: 10 } },
        tuesday,
      ),
    ).toBe("FREQ=DAILY;COUNT=10");
  });

  it("monthly on the day, or on the Nth weekday, ending on a date", () => {
    expect(buildRrule({ ...weekly, frequency: "monthly" }, tuesday)).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=6",
    );
    expect(
      buildRrule(
        {
          ...weekly,
          frequency: "monthly",
          monthlyMode: "weekday-of-month",
          ends: { kind: "on", date: "2027-03-31" },
        },
        tuesday,
      ),
    ).toBe("FREQ=MONTHLY;BYDAY=1TU;UNTIL=20270331");
  });

  it("the last week of a month is -1, as calendars say 'last Tuesday'", () => {
    expect(weekOfMonth({ date: "2026-10-27", day: 27 })).toBe(-1);
    expect(weekOfMonth({ date: "2026-10-20", day: 20 })).toBe(3);
  });

  it("a written rule reads back into the same editor state", () => {
    const spec: RecurrenceSpec = {
      frequency: "weekly",
      interval: 2,
      weekdays: ["MO", "WE"],
      monthlyMode: "day-of-month",
      ends: { kind: "on", date: "2026-12-22" },
    };
    const rule = buildRrule(spec, tuesday);
    expect(parseRrule(rule)).toEqual(spec);
    expect(parseRrule("RRULE:FREQ=DAILY;COUNT=5")).toEqual({
      frequency: "daily",
      interval: 1,
      weekdays: [],
      monthlyMode: "day-of-month",
      ends: { kind: "after", count: 5 },
    });
    expect(parseRrule(null)).toEqual(NO_REPEAT);
  });
});

describe("the rule in a sentence", () => {
  it.each([
    ["FREQ=WEEKLY;BYDAY=TU", "Every Tuesday"],
    [
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
      "Every 2 weeks on Monday and Wednesday",
    ],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
    ["FREQ=DAILY;COUNT=10", "Daily, 10 times"],
    ["FREQ=MONTHLY;BYDAY=1TU", "Monthly on the first Tuesday"],
    ["FREQ=MONTHLY;BYDAY=-1FR", "Monthly on the last Friday"],
    [
      "FREQ=MONTHLY;BYMONTHDAY=6;UNTIL=20270331",
      "Monthly on day 6, until March 31, 2027",
    ],
  ])("%s → %s", (rule, sentence) => {
    expect(describeRecurrence(rule, "en-US")).toBe(sentence);
  });

  it("no rule says so", () => {
    expect(describeRecurrence(null)).toBe("Does not repeat");
  });

  it("the quick menu names the start's own weekday and week", () => {
    const labels = repeatPresets(tuesday).map((p) => p.label);
    expect(labels).toContain("Weekly on Tuesday");
    expect(labels).toContain("Monthly on the first Tuesday");
    expect(labels).toContain("Monthly on day 6");
  });
});
