/**
 * The PR calendar reads the plan exactly as aidream stores it
 * (`services/pr_calendar/plan.py::StoredPlan` on `web.brand.metadata.pr_calendar_plan`) —
 * the fixture is the live All Green Recycling plan's shape (2026-09-28) — and places each
 * moment on its own calendar day, never shifted by a time zone.
 */

import {
  dayKey,
  draftAnglesAsk,
  monthGrid,
  momentsByDay,
  readCalendarPlan,
  type PrMomentRow,
} from "../calendar-model";

const metadata = {
  pr_calendar_plan: {
    generated_at: "2026-09-28T01:23:10+00:00",
    window_start: "2026-09-28",
    window_end: "2027-03-30",
    horizon_end: "2027-09-28",
    feed_size: 22,
    tier_windows: {
      m1: [
        {
          tier: "long_lead",
          label: "Long-lead magazines and trades",
          deadline_on: "2026-09-14",
          pitch_status: "deadline_passed",
          window_opens_on: "2026-06-14",
        },
      ],
    },
    could_not_verify: [],
    notices: [
      {
        code: "pr_calendar.country_assumed",
        __kind: "news_notice",
        remedy: "Add the brand's countries.",
        message: "Public holidays are United States holidays.",
      },
    ],
    plan: {
      __kind: "pr_calendar_plan",
      moments: [
        {
          __kind: "pr_calendar_moment",
          bucket: "watch",
          standing: "strong",
          moment_id: "m1",
          starts_on: "2026-10-14",
          angle_seed: "Device refresh cycles and critical minerals",
          deadline_on: "2026-09-30",
          outlet_tiers: ["national_online"],
          pitch_status: "pitch_now",
          proof_needed: ["first-party tonnage metrics"],
          safety_reason: "",
          standing_reason: "Core business",
          window_opens_on: "2026-08-14",
          coverage_pattern: "",
        },
        { __kind: "pr_calendar_moment", bucket: "drop", moment_id: "m2", standing: "none" },
      ],
      act_this_week: ["m1"],
      gaps_and_clusters: ["October is crowded"],
      coverage_patterns: [],
      dropped_count: 1,
      handoffs: [],
    },
  },
};

const row = {
  id: "m1",
  title: "International E-Waste Day",
  starts_on: "2026-10-14",
  ends_on: null,
} as unknown as PrMomentRow;

test("reads the stored plan: kept moments, windows, notices; drops are counted, not listed", () => {
  const plan = readCalendarPlan(metadata);
  expect(plan?.moments.map((m) => [m.momentId, m.bucket, m.pitchStatus])).toEqual([["m1", "watch", "pitch_now"]]);
  expect(plan?.droppedCount).toBe(1);
  expect(plan?.actThisWeek).toEqual(["m1"]);
  expect(plan?.tierWindows.m1[0]).toMatchObject({ label: "Long-lead magazines and trades", pitchStatus: "deadline_passed" });
  expect(plan?.notices[0]).toEqual({
    code: "pr_calendar.country_assumed",
    message: "Public holidays are United States holidays.",
    remedy: "Add the brand's countries.",
  });
});

test("a brand never planned reads as no plan, not an empty one", () => {
  expect(readCalendarPlan({})).toBeNull();
  expect(readCalendarPlan(null)).toBeNull();
});

test("a moment sits on its own day in a six-week month grid", () => {
  const plan = readCalendarPlan(metadata)!;
  const byDay = momentsByDay(plan.moments, new Map([["m1", row]]));
  expect([...byDay.keys()]).toEqual(["2026-10-14"]);
  const grid = monthGrid(new Date(2026, 9, 1));
  expect(grid).toHaveLength(42);
  expect(grid.map(dayKey)).toContain("2026-10-14");
  expect(grid[0].getDay()).toBe(0);
});

test("Draft angles hands the Director the moment, its seed and the proof it needs", () => {
  const plan = readCalendarPlan(metadata)!;
  expect(draftAnglesAsk(plan.moments[0], row)).toBe(
    'Draft story angles for the calendar moment "International E-Waste Day" (2026-10-14). ' +
      "The planner's seed: Device refresh cycles and critical minerals. Proof it still needs: first-party tonnage metrics.",
  );
});

test("an event spans its days; an awareness month sits on its first day only", () => {
  const plan = readCalendarPlan(metadata)!;
  const m = plan.moments[0];
  const conf = { ...row, starts_on: "2026-10-14", ends_on: "2026-10-16" } as PrMomentRow;
  expect([...momentsByDay([m], new Map([["m1", conf]])).keys()]).toEqual([
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
  ]);
  const month = { ...row, starts_on: "2026-10-01", ends_on: "2026-10-31" } as PrMomentRow;
  expect([...momentsByDay([{ ...m, startsOn: "2026-10-01" }], new Map([["m1", month]])).keys()]).toEqual([
    "2026-10-01",
  ]);
});
