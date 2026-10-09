/**
 * KPIs tab — the pure rules (SI-07b1 / SI-08). No I/O; unit-tested in
 * `__tests__/kpi.test.ts`.
 *
 * A goal is a `social.kpi_goal` row. The UI offers five metrics; the table's
 * CHECK list has no "outlier count", so that one is stored as `metric='custom'`
 * with `metric_label='Outlier count'` (the label is the identity).
 *
 * How "current" is measured (one rule per metric, all from stored snapshots and
 * post stats — nothing is guessed):
 *   followers        sum of each scoped account's newest follower count
 *   avg_views        mean views of scoped posts in the trailing period window
 *   posts_per_week   scoped posts in the trailing period window / (days / 7)
 *   engagement_rate  (likes + comments + shares) / views over those posts, as a
 *                    PERCENT (target 4 means 4%)
 *   outlier_count    scoped posts at or over the neutral outlier tier, from the
 *                    goal's start date to now
 * Scope: the goal's account, else its platform, else every account whose role
 * is `own`. A competitor is in scope only when a goal names it.
 */

import { OUTLIER_TIER_THRESHOLDS, profileBaseline } from "./outlier";
import type { BrandPost, KpiGoalRow, TrackedRole } from "./types";

const DAY_MS = 86_400_000;

export type KpiMetricId =
  | "followers"
  | "avg_views"
  | "posts_per_week"
  | "engagement_rate"
  | "outlier_count";

export const OUTLIER_COUNT_LABEL = "Outlier count";

export interface KpiMetricDef {
  id: KpiMetricId;
  label: string;
  /** `social.kpi_goal.metric` value. */
  db: string;
  dbLabel: string | null;
  unit: "count" | "percent" | "rate";
  /** Cumulative metrics have a pace (progress against time elapsed). */
  cumulative: boolean;
}

export const KPI_METRICS: readonly KpiMetricDef[] = [
  { id: "followers", label: "Followers", db: "followers", dbLabel: null, unit: "count", cumulative: true },
  { id: "avg_views", label: "Avg views", db: "views", dbLabel: null, unit: "count", cumulative: false },
  { id: "posts_per_week", label: "Posts per week", db: "posts", dbLabel: null, unit: "rate", cumulative: false },
  { id: "engagement_rate", label: "Engagement rate", db: "engagement_rate", dbLabel: null, unit: "percent", cumulative: false },
  { id: "outlier_count", label: "Outlier count", db: "custom", dbLabel: OUTLIER_COUNT_LABEL, unit: "count", cumulative: true },
];

export function metricDefOf(id: KpiMetricId): KpiMetricDef {
  const def = KPI_METRICS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown KPI metric ${id}`);
  return def;
}

/** The UI metric a stored goal row means, or null for one this UI does not model. */
export function goalMetricId(goal: Pick<KpiGoalRow, "metric" | "metric_label">): KpiMetricId | null {
  const hit = KPI_METRICS.find(
    (m) => m.db === goal.metric && (m.dbLabel === null || m.dbLabel === goal.metric_label),
  );
  return hit?.id ?? null;
}

export const KPI_PERIODS = [
  { value: "week", label: "Week", days: 7 },
  { value: "month", label: "Month", days: 30 },
  { value: "quarter", label: "Quarter", days: 90 },
  { value: "year", label: "Year", days: 365 },
] as const;

export function periodDays(
  goal: Pick<KpiGoalRow, "period" | "starts_on" | "ends_on">,
): number {
  const fixed = KPI_PERIODS.find((p) => p.value === goal.period);
  if (fixed) return fixed.days;
  if (goal.ends_on) {
    const span = (Date.parse(goal.ends_on) - Date.parse(goal.starts_on)) / DAY_MS;
    if (Number.isFinite(span) && span >= 1) return Math.round(span);
  }
  return 30;
}

/** Share of the target at which a level metric still reads "On track". */
export const KPI_ON_TRACK_SHARE = 0.8;

/** How far behind the clock a cumulative goal may run and still read "On track" (a fresh goal is not Behind on day one). */
export const KPI_PACE_TOLERANCE = 0.1;

export type KpiStatus = "achieved" | "on_track" | "behind" | "no_data" | "paused";

export const KPI_STATUS_LABELS: Record<KpiStatus, string> = {
  achieved: "Achieved",
  on_track: "On track",
  behind: "Behind",
  no_data: "No data",
  paused: "Paused",
};

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export interface KpiAccount {
  trackedAccountId: string;
  platform: string;
  role: TrackedRole;
  followers: number | null;
}

export function inGoalScope(
  goal: Pick<KpiGoalRow, "tracked_account_id" | "platform">,
  account: Pick<KpiAccount, "trackedAccountId" | "platform" | "role">,
): boolean {
  if (goal.tracked_account_id) return account.trackedAccountId === goal.tracked_account_id;
  if (goal.platform && account.platform !== goal.platform) return false;
  return account.role === "own";
}

// ---------------------------------------------------------------------------
// Current value
// ---------------------------------------------------------------------------

function inWindow(p: BrandPost, fromMs: number, toMs: number): boolean {
  const at = p.postedAt ? Date.parse(p.postedAt) : NaN;
  return Number.isFinite(at) && at >= fromMs && at <= toMs;
}

export interface MeasureInput {
  goal: Pick<
    KpiGoalRow,
    "tracked_account_id" | "platform" | "period" | "starts_on" | "ends_on"
  >;
  metric: KpiMetricId;
  accounts: readonly KpiAccount[];
  posts: readonly BrandPost[];
  now: number;
}

export interface Measurement {
  /** null = nothing to measure from (never 0). */
  value: number | null;
  /** How many accounts / posts the number rests on. */
  accounts: number;
  posts: number;
}

export function measureGoal(input: MeasureInput): Measurement {
  const { goal, metric, now } = input;
  const accounts = input.accounts.filter((a) => inGoalScope(goal, a));
  const ids = new Set(accounts.map((a) => a.trackedAccountId));
  const scoped = input.posts.filter((p) => ids.has(p.trackedAccountId));
  const days = periodDays(goal);

  if (metric === "followers") {
    const known = accounts.map((a) => a.followers).filter((v): v is number => v !== null);
    return {
      value: known.length === 0 ? null : known.reduce((s, v) => s + v, 0),
      accounts: accounts.length,
      posts: 0,
    };
  }

  if (metric === "outlier_count") {
    const from = Date.parse(goal.starts_on);
    const hits = scoped.filter(
      (p) =>
        (p.outlierScore ?? 0) >= OUTLIER_TIER_THRESHOLDS.neutral &&
        inWindow(p, Number.isFinite(from) ? from : now - days * DAY_MS, now),
    );
    // Zero is a measurement only when scored posts exist to have been counted.
    const anyScored = scoped.some((p) => p.outlierScore !== null);
    return { value: anyScored ? hits.length : null, accounts: accounts.length, posts: hits.length };
  }

  const recent = scoped.filter((p) => inWindow(p, now - days * DAY_MS, now));
  if (metric === "posts_per_week") {
    return {
      value: accounts.length === 0 ? null : recent.length / (days / 7),
      accounts: accounts.length,
      posts: recent.length,
    };
  }
  if (metric === "avg_views") {
    const views = recent.map((p) => p.views).filter((v): v is number => v !== null);
    return {
      value: views.length === 0 ? null : views.reduce((s, v) => s + v, 0) / views.length,
      accounts: accounts.length,
      posts: views.length,
    };
  }
  // engagement_rate (percent)
  let views = 0;
  let engaged = 0;
  let counted = 0;
  for (const p of recent) {
    if (p.views === null || p.views <= 0) continue;
    views += p.views;
    engaged += (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
    counted += 1;
  }
  return {
    value: views > 0 ? (engaged / views) * 100 : null,
    accounts: accounts.length,
    posts: counted,
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface GoalProgress {
  current: number | null;
  target: number;
  /** Progress toward the target, 0..1 (clamped); null with no data. */
  fraction: number | null;
  /** Share of the period elapsed, 0..1. */
  elapsed: number;
  status: KpiStatus;
}

export function elapsedShare(
  goal: Pick<KpiGoalRow, "period" | "starts_on" | "ends_on">,
  now: number,
): number {
  const start = Date.parse(goal.starts_on);
  if (!Number.isFinite(start)) return 0;
  const span = periodDays(goal) * DAY_MS;
  return Math.min(1, Math.max(0, (now - start) / span));
}

export function goalProgress(args: {
  goal: Pick<
    KpiGoalRow,
    "target_value" | "baseline_value" | "status" | "period" | "starts_on" | "ends_on"
  >;
  metric: KpiMetricId;
  current: number | null;
  now: number;
}): GoalProgress {
  const { goal, metric, current, now } = args;
  const target = Number(goal.target_value);
  const elapsed = elapsedShare(goal, now);
  if (goal.status === "paused") {
    return { current, target, fraction: null, elapsed, status: "paused" };
  }
  if (current === null || !Number.isFinite(target) || target <= 0) {
    return { current, target, fraction: null, elapsed, status: "no_data" };
  }
  if (current >= target) {
    return { current, target, fraction: 1, elapsed, status: "achieved" };
  }
  const def = metricDefOf(metric);
  const baseline =
    goal.baseline_value === null || goal.baseline_value === undefined
      ? metric === "outlier_count"
        ? 0
        : null
      : Number(goal.baseline_value);
  if (def.cumulative && baseline !== null && target > baseline) {
    const fraction = Math.min(1, Math.max(0, (current - baseline) / (target - baseline)));
    return {
      current,
      target,
      fraction,
      elapsed,
      status: fraction >= elapsed - KPI_PACE_TOLERANCE ? "on_track" : "behind",
    };
  }
  const fraction = Math.min(1, Math.max(0, current / target));
  return {
    current,
    target,
    fraction,
    elapsed,
    status: fraction >= KPI_ON_TRACK_SHARE ? "on_track" : "behind",
  };
}

/** Display text for a metric value (`12.4K`, `3.5`, `4.2%`). */
export function formatKpiValue(metric: KpiMetricId, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const unit = metricDefOf(metric).unit;
  if (unit === "percent") return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
  if (unit === "rate") return String(Math.round(value * 10) / 10);
  const abs = Math.abs(value);
  const trim = (n: number) => String(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return String(Math.round(value));
}

// ---------------------------------------------------------------------------
// Benchmark (own accounts vs tracked competitors)
// ---------------------------------------------------------------------------

export interface BenchmarkRow {
  rowId: string;
  platform: string;
  handle: string;
  profileUrl?: string | null;
  displayName: string;
  role: TrackedRole;
  followers: number | null;
  growth: number | null;
  growthNote: string;
  postsPerWeek: number | null;
  medianViews: number | null;
  engagementRate: number | null;
  outlierRate: number | null;
  profileId: string | null;
}

/**
 * Activity numbers for one account's posts: cadence and outlier rate over the last 30 days; median
 * views and engagement from THE profile baseline (`profileBaseline`, latest 30 posts) so this
 * table agrees with the account page.
 */
export function benchmarkActivity(
  posts: readonly BrandPost[],
  now: number,
  windowDays = 30,
): Pick<BenchmarkRow, "postsPerWeek" | "medianViews" | "engagementRate" | "outlierRate"> {
  const recent = posts.filter((p) => inWindow(p, now - windowDays * DAY_MS, now));
  const base = profileBaseline(posts);
  const scored = recent.filter((p) => p.outlierScore !== null);
  return {
    postsPerWeek: recent.length === 0 ? null : Math.round((recent.length / (windowDays / 7)) * 10) / 10,
    medianViews: base.medianViews,
    engagementRate: base.engagementRate,
    outlierRate:
      scored.length === 0
        ? null
        : scored.filter((p) => (p.outlierScore ?? 0) >= OUTLIER_TIER_THRESHOLDS.neutral).length /
          scored.length,
  };
}

/** Own rows first, then by followers descending. */
export function sortBenchmark(rows: readonly BenchmarkRow[]): BenchmarkRow[] {
  return [...rows].sort((a, b) => {
    if ((a.role === "own") !== (b.role === "own")) return a.role === "own" ? -1 : 1;
    return (b.followers ?? -1) - (a.followers ?? -1);
  });
}
