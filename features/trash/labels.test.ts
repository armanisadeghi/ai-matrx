import { groupScheduleText, isScheduleOverdue, whenPhrase } from "./labels";

describe("whenPhrase", () => {
  test.each([
    [0, "today"],
    [1, "tomorrow"],
    [6, "in 6 days"],
  ])("reports %i days as %s", (daysLeft, expected) => {
    expect(whenPhrase(daysLeft)).toBe(expected);
  });
});

describe("isScheduleOverdue", () => {
  const asOf = "2026-09-20T12:00:00.000Z";

  test.each([
    ["2026-09-19T12:00:00.000Z", asOf, true],
    ["2026-09-20T12:00:00.000Z", asOf, false],
    ["2026-09-21T12:00:00.000Z", asOf, false],
    [null, asOf, false],
    ["not-a-date", asOf, false],
  ])("compares wipe_on %p to the notice clock", (wipeOn, noticeAsOf, expected) => {
    expect(isScheduleOverdue(wipeOn, noticeAsOf)).toBe(expected);
  });
});

describe("groupScheduleText", () => {
  const asOf = "2026-09-20T12:00:00.000Z";

  test.each([
    [{ wipeOn: "2026-09-19T12:00:00.000Z", asOf, daysLeft: 0, rows: 2 }, "Eligible for deletion since September 19, 2026."],
    [{ wipeOn: "2026-09-20T12:00:00.000Z", asOf, daysLeft: 0, rows: 1 }, "Deleted for good on September 20, 2026 (today)."],
    [{ wipeOn: "2026-09-26T12:00:00.000Z", asOf, daysLeft: 6, rows: 2 }, "The first goes for good on September 26, 2026 (in 6 days)."],
    [{ wipeOn: "not-a-date", asOf, daysLeft: 0, rows: 1 }, "Deleted for good today."],
  ])("renders producer-shaped schedule %#", (input, expected) => {
    expect(groupScheduleText(input)).toBe(expected);
  });
});
