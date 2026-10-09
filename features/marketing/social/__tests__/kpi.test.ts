import {
  benchmarkActivity,
  elapsedShare,
  formatKpiValue,
  goalMetricId,
  goalProgress,
  inGoalScope,
  measureGoal,
  periodDays,
  sortBenchmark,
  type KpiAccount,
} from "../kpi";
import type { BrandPost } from "../types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const own: KpiAccount = { trackedAccountId: "own1", platform: "tiktok", role: "own", followers: 12_000 };
const own2: KpiAccount = { trackedAccountId: "own2", platform: "youtube", role: "own", followers: 3_000 };
const rival: KpiAccount = { trackedAccountId: "r1", platform: "tiktok", role: "competitor", followers: 900_000 };

function post(id: string, acct: string, daysAgo: number, over: Partial<BrandPost> = {}): BrandPost {
  return {
    postId: id, platform: "tiktok", profileId: acct, handle: acct, format: "video", url: "u", thumbnailUrl: null,
    hookLine: id, postedAt: ago(daysAgo), durationSeconds: 10, views: 1000, likes: 50, comments: 10, shares: 10,
    isAd: false, removed: false,
    outlier: { score: 1, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null },
    outlierScore: 1, percentile: null, role: acct.startsWith("own") ? "own" : "competitor", trackedAccountId: acct, ...over,
  };
}
const goal = (over = {}) => ({
  tracked_account_id: null as string | null, platform: null as string | null,
  period: "month", starts_on: "2026-10-01", ends_on: null as string | null, ...over,
});

describe("goal metric identity", () => {
  it("maps stored metrics, outlier count rides custom + label", () => {
    expect(goalMetricId({ metric: "followers", metric_label: null })).toBe("followers");
    expect(goalMetricId({ metric: "views", metric_label: null })).toBe("avg_views");
    expect(goalMetricId({ metric: "custom", metric_label: "Outlier count" })).toBe("outlier_count");
    expect(goalMetricId({ metric: "custom", metric_label: "Something else" })).toBeNull();
    expect(goalMetricId({ metric: "shares", metric_label: null })).toBeNull();
  });
  it("period lengths", () => {
    expect(periodDays(goal({ period: "week" }))).toBe(7);
    expect(periodDays(goal({ period: "custom", ends_on: "2026-10-11" }))).toBe(10);
  });
});

describe("scope", () => {
  it("defaults to own accounts; a named account or platform narrows; competitors only when named", () => {
    expect(inGoalScope(goal(), own)).toBe(true);
    expect(inGoalScope(goal(), rival)).toBe(false);
    expect(inGoalScope(goal({ platform: "youtube" }), own)).toBe(false);
    expect(inGoalScope(goal({ platform: "youtube" }), own2)).toBe(true);
    expect(inGoalScope(goal({ tracked_account_id: "r1" }), rival)).toBe(true);
  });
});

describe("measureGoal (current value)", () => {
  const posts = [
    post("a", "own1", 2, { views: 1000, likes: 80, comments: 10, shares: 10 }),
    post("b", "own1", 10, { views: 3000, likes: 100, comments: 0, shares: 0, outlierScore: 3.5 }),
    post("old", "own1", 60, { views: 99999 }),
    post("rival", "r1", 1, { views: 777777 }),
  ];
  it("followers sums each in-scope account's newest count", () => {
    expect(measureGoal({ goal: goal(), metric: "followers", accounts: [own, own2, rival], posts, now: NOW }).value).toBe(15_000);
  });
  it("followers with no count is unmeasured, not zero", () => {
    expect(measureGoal({ goal: goal(), metric: "followers", accounts: [{ ...own, followers: null }], posts, now: NOW }).value).toBeNull();
  });
  it("avg views is the mean over the trailing period window", () => {
    expect(measureGoal({ goal: goal(), metric: "avg_views", accounts: [own, rival], posts, now: NOW }).value).toBe(2000);
  });
  it("posts per week divides by period weeks", () => {
    const m = measureGoal({ goal: goal(), metric: "posts_per_week", accounts: [own], posts, now: NOW });
    expect(m.value).toBeCloseTo(2 / (30 / 7), 6);
  });
  it("engagement rate is a percent over summed views", () => {
    const m = measureGoal({ goal: goal(), metric: "engagement_rate", accounts: [own], posts, now: NOW });
    expect(m.value).toBeCloseTo(((100 + 100) / 4000) * 100, 6);
  });
  it("outlier count counts 2x+ posts since the goal started; zero only when scored posts exist", () => {
    expect(measureGoal({ goal: goal({ starts_on: "2026-09-20" }), metric: "outlier_count", accounts: [own], posts, now: NOW }).value).toBe(1);
    expect(measureGoal({ goal: goal(), metric: "outlier_count", accounts: [own], posts, now: NOW }).value).toBe(0);
    expect(
      measureGoal({ goal: goal(), metric: "outlier_count", accounts: [own], posts: [post("x", "own1", 1, { outlierScore: null })], now: NOW }).value,
    ).toBeNull();
    expect(
      measureGoal({ goal: goal(), metric: "outlier_count", accounts: [own], posts: [post("x", "own1", 1)], now: NOW }).value,
    ).toBe(0);
  });
  it("no posts: avg views and engagement are null", () => {
    expect(measureGoal({ goal: goal(), metric: "avg_views", accounts: [own], posts: [], now: NOW }).value).toBeNull();
    expect(measureGoal({ goal: goal(), metric: "engagement_rate", accounts: [own], posts: [], now: NOW }).value).toBeNull();
  });
});

describe("goalProgress (current vs target)", () => {
  const g = (over = {}) => ({ target_value: 15000, baseline_value: 10000 as number | null, status: "active", period: "month", starts_on: "2026-09-24", ends_on: null as string | null, ...over });
  it("achieved at or over target", () => {
    const p = goalProgress({ goal: g(), metric: "followers", current: 15200, now: NOW });
    expect(p.status).toBe("achieved");
    expect(p.fraction).toBe(1);
  });
  it("cumulative goal: progress since baseline vs time elapsed", () => {
    // 15 of 30 days elapsed (starts 09-24, now 10-09 12:00 => 15.5d)
    const half = goalProgress({ goal: g(), metric: "followers", current: 12900, now: NOW });
    expect(half.fraction).toBeCloseTo(0.58, 2);
    expect(half.status).toBe("on_track");
    const slow = goalProgress({ goal: g(), metric: "followers", current: 10500, now: NOW });
    expect(slow.fraction).toBeCloseTo(0.1, 2);
    expect(slow.status).toBe("behind");
  });
  it("a goal set today is not Behind on day one", () => {
    const fresh = goalProgress({ goal: g({ starts_on: "2026-10-09" }), metric: "followers", current: 10000, now: NOW });
    expect(fresh.fraction).toBe(0);
    expect(fresh.status).toBe("on_track");
  });
  it("level metric: on track from 80% of target, else behind", () => {
    const base = { baseline_value: null, target_value: 5000 };
    expect(goalProgress({ goal: g(base), metric: "avg_views", current: 4100, now: NOW }).status).toBe("on_track");
    expect(goalProgress({ goal: g(base), metric: "avg_views", current: 2000, now: NOW }).status).toBe("behind");
  });
  it("outlier count paces from a zero baseline", () => {
    const o = goalProgress({ goal: g({ target_value: 4, baseline_value: null }), metric: "outlier_count", current: 1, now: NOW });
    expect(o.fraction).toBe(0.25);
    expect(o.status).toBe("behind");
  });
  it("no measurement is No data, paused stays paused, never a fake zero", () => {
    expect(goalProgress({ goal: g(), metric: "followers", current: null, now: NOW }).status).toBe("no_data");
    expect(goalProgress({ goal: g({ status: "paused" }), metric: "followers", current: 100, now: NOW }).status).toBe("paused");
  });
  it("elapsed share clamps to the period", () => {
    expect(elapsedShare({ period: "week", starts_on: "2026-10-09", ends_on: null }, NOW - 5 * DAY)).toBe(0);
    expect(elapsedShare({ period: "week", starts_on: "2026-09-01", ends_on: null }, NOW)).toBe(1);
  });
  it("formats values by unit", () => {
    expect(formatKpiValue("followers", 12400)).toBe("12.4K");
    expect(formatKpiValue("engagement_rate", 4.25)).toBe("4.3%");
    expect(formatKpiValue("posts_per_week", 3.456)).toBe("3.5");
    expect(formatKpiValue("avg_views", null)).toBe("—");
  });
});

describe("benchmark", () => {
  it("30-day cadence, median views, engagement, outlier rate", () => {
    const posts = [
      post("a", "r1", 3, { views: 1000, outlierScore: 3 }),
      post("b", "r1", 5, { views: 3000, outlierScore: 1 }),
      post("c", "r1", 40, { views: 9999 }),
    ];
    const a = benchmarkActivity(posts, NOW);
    expect(a.postsPerWeek).toBe(0.5);
    expect(a.medianViews).toBe(2000);
    expect(a.outlierRate).toBe(0.5);
    expect(a.engagementRate).toBeCloseTo(140 / 4000, 6);
  });
  it("nothing in 30 days is all null, not zeros", () => {
    expect(benchmarkActivity([post("z", "r1", 80)], NOW)).toEqual({ postsPerWeek: null, medianViews: null, engagementRate: null, outlierRate: null });
  });
  it("own rows sort first", () => {
    const row = (id: string, role: "own" | "competitor", followers: number) =>
      ({ rowId: id, platform: "tiktok", handle: id, displayName: id, role, followers, growth: null, growthNote: "", postsPerWeek: null, medianViews: null, engagementRate: null, outlierRate: null, profileId: null });
    const sorted = sortBenchmark([row("big", "competitor", 9e6), row("mine", "own", 10), row("mid", "competitor", 5e5)]);
    expect(sorted.map((r) => r.rowId)).toEqual(["mine", "big", "mid"]);
  });
});
