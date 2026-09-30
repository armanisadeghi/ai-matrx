"use client";

// components/official/drill-explorer/useDrillKnobs.ts — THE EXPLORER'S SETTINGS, READ ONCE
// (lane DRILL-ADOPT; program DRILL-FINISH decisions 4, 5, 8, 16, 28; VERIFY-DRILL-WAVE2 W2-5;
// VERIFY-DRILL-LIVE F1).
//
// Every line the explorer draws by is a feature knob an organization can move, never a constant:
//   drill.chart.top_n                 series a chart draws before Other          (MatrxDrillChart seriesLimit)
//   drill.pareto.share_pct            the share the Pareto line marks             (answer table `pareto`)
//   drill.pivot_columns               pivot columns before the rest column        (answer table `pivotColumnCap`)
//   drill.auto_grain.hour_max_days / day_max_days / week_max_days — the window lengths up to which a
//                                     time group reads by hour, by day, by week (longer: by month) (grain.ts)
//   <definition's stale_after_knob>   minutes after which the door's as_of is "behind" (usage: 20)
// Every name is read through `readDrillKnob` (drillKnob.ts): the door's own address rule and the
// effective value — never a hand-split pair (F1: the stale knob was split at its first dot and read as
// missing on every usage answer).
//
// A knob that cannot be read is STATE on screen (the explorer's "Defaults" badge, the names in its
// tooltip) and the package's own line is used — a missing knob is never silent.

import { useEffect, useState } from "react";

import type { DrillGrainLines } from "./grain";
import { readDrillKnob, type DrillLane } from "./drillKnob";

export interface DrillKnobs {
  /** False until every read answered (a value or a failure). */
  settled: boolean;
  chartTopN: number | null;
  paretoSharePct: number | null;
  pivotColumns: number | null;
  /** The auto-grain lines, or null when any of them could not be read (the package's own lines then). */
  grainLines: DrillGrainLines | null;
  /** Each setting that could not be read: its short name (for the badge's tooltip) and why (for the code/log). */
  unread: Array<{ name: string; label: string; why: string }>;
}

/** The settings every explorer reads, with the short label the "Defaults" tooltip names them by. */
export const DRILL_KNOB_READS = [
  { name: "drill.chart.top_n", label: "Chart series" },
  { name: "drill.pareto.share_pct", label: "Pareto share" },
  { name: "drill.pivot_columns", label: "Pivot columns" },
  { name: "drill.auto_grain.hour_max_days", label: "Time grain" },
  { name: "drill.auto_grain.day_max_days", label: "Time grain" },
  { name: "drill.auto_grain.week_max_days", label: "Time grain" },
] as const;

type Got = { ok: true; value: number } | { ok: false; message: string };
type Seat = { lane: DrillLane; organizationId: string | null; userId: string | null };

const shared = new Map<string, { at: number; got: Promise<Got[]> }>();
/** One read of the settings per seat per minute, shared by every explorer on the page (the snapshot's cache is 60 s too). */
function readAll(seat: Seat, names: readonly string[]): Promise<Got[]> {
  const key = JSON.stringify([seat.lane, seat.lane === "platform" ? null : seat.organizationId, seat.userId, names]);
  const held = shared.get(key);
  if (held && Date.now() - held.at <= 60_000) return held.got;
  const got = Promise.all(
    names.map((name) =>
      readDrillKnob(name, seat).then(
        (value): Got => ({ ok: true, value }),
        (e: unknown): Got => ({ ok: false, message: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  );
  shared.set(key, { at: Date.now(), got });
  return got;
}

/** The knobs as the explorer reads them, from the answers in `DRILL_KNOB_READS` order. Pure, for tests. */
export function drillKnobsOf(got: readonly Got[]): Omit<DrillKnobs, "settled"> {
  const unread: DrillKnobs["unread"] = [];
  const value = (i: number, name: string, label: string): number | null => {
    const g = got[i];
    if (g?.ok) return g.value;
    unread.push({ name, label, why: g && !g.ok ? g.message : "no answer" });
    return null;
  };
  const [chartTopN, paretoSharePct, pivotColumns, hour, day, week] = DRILL_KNOB_READS.map((r, i) => value(i, r.name, r.label));
  return {
    chartTopN: chartTopN ?? null,
    paretoSharePct: paretoSharePct ?? null,
    pivotColumns: pivotColumns ?? null,
    grainLines: hour != null && day != null && week != null ? { hourMaxDays: hour, dayMaxDays: day, weekMaxDays: week } : null,
    unread,
  };
}

const UNSETTLED: DrillKnobs = { settled: false, chartTopN: null, paretoSharePct: null, pivotColumns: null, grainLines: null, unread: [] };

export function useDrillKnobs(seat: Seat): DrillKnobs {
  const key = JSON.stringify([seat.lane, seat.organizationId, seat.userId]);
  const [held, setHeld] = useState<{ key: string; knobs: DrillKnobs }>({ key: "", knobs: UNSETTLED });
  useEffect(() => {
    let cancelled = false;
    void readAll({ lane: seat.lane, organizationId: seat.organizationId, userId: seat.userId }, DRILL_KNOB_READS.map((r) => r.name)).then((got) => {
      if (!cancelled) setHeld({ key, knobs: { settled: true, ...drillKnobsOf(got) } });
    });
    return () => {
      cancelled = true;
    };
    // `key` carries every input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return held.key === key ? held.knobs : UNSETTLED;
}

/**
 * The definition's stale line (`stale_after_knob`, e.g. drill.usage.stale_after_minutes), read the same
 * way. `unread` is set when the definition names one and it could not be read (the badge says so).
 */
export function useDrillStaleAfter(name: string | null, seat: Seat): { minutes: number | null; unread: DrillKnobs["unread"][number] | null } {
  const key = JSON.stringify([name, seat.lane, seat.organizationId, seat.userId]);
  const [held, setHeld] = useState<{ key: string; minutes: number | null; unread: DrillKnobs["unread"][number] | null }>({ key: "", minutes: null, unread: null });
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    void readAll({ lane: seat.lane, organizationId: seat.organizationId, userId: seat.userId }, [name]).then(([got]) => {
      if (cancelled) return;
      if (got?.ok) setHeld({ key, minutes: got.value, unread: null });
      else setHeld({ key, minutes: null, unread: { name, label: "Stale after", why: got && !got.ok ? got.message : "no answer" } });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return held.key === key ? { minutes: held.minutes, unread: held.unread } : { minutes: null, unread: null };
}
