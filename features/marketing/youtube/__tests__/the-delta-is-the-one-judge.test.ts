/**
 * THE 30-DAY DELTA GOES THROUGH THE PLATFORM'S ONE COMPARISON JUDGE, AND A
 * REFUSED COMPARISON ALWAYS PRINTS ITS REASON.
 *
 * WHY THIS SUITE EXISTS. On 2026-09-17 the Search Console delta existed in
 * three private copies, each judging the PREVIOUS window's coverage only
 * against a hand-typed `21`: five live sites at 8 of 28 current days against 23
 * of 28 previous ones were painted as a ~70% collapse while their traffic per
 * collected day was flat or UP, and when the rule DID suppress a percentage it
 * printed nothing at all. A YouTube panel is exactly the surface that would
 * grow the fourth copy — a channel's views are two totals and two day counts,
 * the same shape — so this proves the channel numbers ask the same judge and
 * that the feature declares no judge of its own.
 */

import fs from "node:fs";
import path from "node:path";

import {
  gscDeltaRefusalLabel,
  judgeGscWindowDelta,
} from "@/features/marketing/analytics/gsc-delta";
import {
  CHANNEL_WINDOW_DAYS,
  channelWindowTotals,
  splitChannelWindows,
} from "../record";
import type { ChannelAnalyticsDayRow } from "../types";

const NOW = new Date("2026-09-19T12:00:00Z");

function day(date: string, views: number, watch = views * 2): ChannelAnalyticsDayRow {
  return {
    id: `row-${date}`,
    organization_id: "org-1",
    channel_resource_id: "res-1",
    date,
    views,
    watch_time_minutes: watch,
    avg_view_duration_seconds: views > 0 ? (watch * 60) / views : 0,
    subscribers_gained: 1,
    video_external_id: null,
    metadata: {},
    version: 1,
    created_at: "2026-09-19T00:00:00Z",
    created_by: null,
    updated_at: "2026-09-19T00:00:00Z",
    updated_by: null,
  } as ChannelAnalyticsDayRow;
}

/** `count` consecutive days ending `endsOn`, each with `views`. */
function run(endsOn: string, count: number, views: number): ChannelAnalyticsDayRow[] {
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    day(new Date(end - index * 86_400_000).toISOString().slice(0, 10), views),
  );
}

describe("two windows collected alike", () => {
  const rows = [...run("2026-09-19", 30, 200), ...run("2026-08-20", 30, 100)];
  const { current, previous } = splitChannelWindows(rows, NOW, CHANNEL_WINDOW_DAYS);

  it("splits the stored days into the window and the one before it", () => {
    expect(channelWindowTotals(current).daysWithData).toBe(30);
    expect(channelWindowTotals(previous).daysWithData).toBe(30);
  });

  it("prints a percentage, because both windows were collected the same way", () => {
    const delta = judgeGscWindowDelta({
      current: channelWindowTotals(current).views,
      previous: channelWindowTotals(previous).views,
      currentDaysWithData: 30,
      previousDaysWithData: 30,
      windowDays: CHANNEL_WINDOW_DAYS,
    });
    expect(delta.verdict).toBe("comparable");
    expect(delta.percent).toBeCloseTo(100, 5);
    expect(delta.caveat).toBeNull();
  });
});

/**
 * THE REFUSAL CASE — the one the five live sites got wrong. Twenty-eight
 * collected days now against six before: the raw totals say the channel
 * collapsed, and per COLLECTED day it grew.
 */
describe("a partially collected window", () => {
  const delta = judgeGscWindowDelta({
    current: 6_000,
    previous: 3_000,
    currentDaysWithData: 28,
    previousDaysWithData: 6,
    windowDays: CHANNEL_WINDOW_DAYS,
  });

  it("refuses the percentage rather than printing one over unequal coverage", () => {
    expect(delta.verdict).toBe("coverage_refused");
    expect(delta.percent).toBeNull();
  });

  it("ALWAYS prints a label and a reason carrying BOTH day counts", () => {
    const label = gscDeltaRefusalLabel(delta);
    expect(label).toContain("28");
    expect(label).toContain("6");
    expect(delta.caveat).not.toBeNull();
    expect(String(delta.caveat)).toMatch(/28/);
    expect(String(delta.caveat)).toMatch(/6/);
  });

  it("still tells the reader which way it moved, per collected day", () => {
    expect(delta.currentPerDay).toBeCloseTo(6_000 / 28, 5);
    expect(delta.previousPerDay).toBeCloseTo(3_000 / 6, 5);
    // The honest reading is a FALL per collected day, while the raw totals
    // doubled — the direction the three private copies got backwards.
    expect(delta.currentPerDay!).toBeLessThan(delta.previousPerDay!);
  });
});

describe("a channel with no history before this window", () => {
  const delta = judgeGscWindowDelta({
    current: 1_430,
    previous: 0,
    currentDaysWithData: 30,
    previousDaysWithData: 30,
    windowDays: CHANNEL_WINDOW_DAYS,
  });

  it("is `no_baseline`, never a coverage refusal", () => {
    expect(delta.verdict).toBe("no_baseline");
    expect(delta.comparison.state).toBe("comparable");
  });

  it("uses metric-neutral words — a channel has views, not sessions", () => {
    expect(String(delta.caveat)).not.toContain("sessions");
    expect(gscDeltaRefusalLabel(delta)).toContain("no previous period");
  });
});

describe("average view duration", () => {
  it("is watch time ÷ views, never a mean of each day's mean", () => {
    // One busy day at 60s/view and one quiet day at 600s/view. A mean of means
    // says 330s; the truth is barely above 60s, because almost every view
    // happened on the busy day.
    const rows = [day("2026-09-18", 10_000, 10_000), day("2026-09-19", 10, 100)];
    const totals = channelWindowTotals(rows);
    expect(totals.avgViewDurationSeconds).toBeCloseTo((10_100 * 60) / 10_010, 5);
    expect(totals.avgViewDurationSeconds).toBeLessThan(100);
  });

  it("is zero, not NaN, when a window has watch time but no views", () => {
    expect(channelWindowTotals([day("2026-09-19", 0, 5)]).avgViewDurationSeconds).toBe(0);
  });
});

/**
 * THE CENSUS. A feature that grows its own `trendPercent` is how the three
 * copies happened; `gsc-delta.test.ts` walks `features/marketing` for that
 * name, and this walks THIS feature for any second judge at all.
 */
describe("this feature declares no comparison judge of its own", () => {
  const root = path.join(__dirname, "..");
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }
  const sources = walk(root).map((file) => ({
    file: path.relative(root, file),
    text: fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, ""),
  }));

  it("computes no percentage change anywhere outside the judge", () => {
    const offenders = sources
      .filter(({ text }) => /function\s+\w*(trend|delta)\w*Percent/i.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("types no coverage threshold by hand", () => {
    const offenders = sources
      .filter(({ text }) => /(prev_days|previousDays|prevDays)\s*(>=|<)\s*\d+/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
