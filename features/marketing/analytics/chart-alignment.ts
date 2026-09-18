/**
 * THE TREND CHART'S ALIGNMENT — pure, so the geometry is provable with days a
 * test writes by hand.
 *
 * WHY IT EXISTS (round-2 verdict NEW-B3, 2026-09-17). `AnalyticsTrendChart`
 * placed every point by its INDEX in the collected array: `x(index) = PAD.left +
 * (index / (series.length - 1)) * plotW`, with the CURRENT series' length, and
 * then drew the previous window's points through the same function. Two lies
 * came out of that one line:
 *
 *   1. Day N of the previous window was drawn — and hovered — against the Nth
 *      COLLECTED previous day. With the live All Green shape (28 current days,
 *      6 previous) the dashed line was squeezed into the first six
 *      twenty-eighths of the axis and read as a collapse, and every hover
 *      compared the wrong two days.
 *   2. A GAP in the current window silently compressed the axis too: a missing
 *      Tuesday made Wednesday take Tuesday's place instead of leaving a hole.
 *
 * The fix is to place a day by its OFFSET FROM ITS OWN WINDOW'S START — day N of
 * the previous window sits under day N of the current window, by construction —
 * and to draw nothing where a day was never collected.
 */

import type { AnalyticsDayPoint } from "@/features/marketing/analytics/window";

/** Whole days between two date-only (`yyyy-mm-dd`) values, UTC. */
export function dayOffset(date: string, start: string): number {
  const at = (value: string): number => {
    const [y, m, d] = value.split("-").map((part) => Number(part));
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((at(date) - at(start)) / 86_400_000);
}

export interface AlignedDay {
  /** 0-based day offset from the window's first day. */
  offset: number;
  point: AnalyticsDayPoint;
}

/**
 * The window's collected days keyed by offset from `start`, in order, with days
 * outside `[0, windowDays)` dropped (a window never plots a day it does not
 * own).
 */
export function alignWindowDays(
  points: readonly AnalyticsDayPoint[],
  start: string,
  windowDays: number,
): AlignedDay[] {
  if (!start || windowDays <= 0) return [];
  return points
    .map((point) => ({ offset: dayOffset(point.date, start), point }))
    .filter((day) => day.offset >= 0 && day.offset < windowDays)
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Contiguous runs of collected days. Each run is drawn as its own subpath, so an
 * uncollected day is a GAP in the line rather than a straight segment implying
 * data nobody has.
 */
export function contiguousRuns(days: readonly AlignedDay[]): AlignedDay[][] {
  const runs: AlignedDay[][] = [];
  let run: AlignedDay[] = [];
  for (const day of days) {
    const previous = run[run.length - 1];
    if (previous && day.offset !== previous.offset + 1) {
      runs.push(run);
      run = [];
    }
    run.push(day);
  }
  if (run.length) runs.push(run);
  return runs;
}

/** The day at this offset, or null when that day was never collected. */
export function dayAtOffset(
  days: readonly AlignedDay[],
  offset: number,
): AnalyticsDayPoint | null {
  return days.find((day) => day.offset === offset)?.point ?? null;
}
