"use client";

// components/official/drill-explorer/useDrillKnobs.ts — THE EXPLORER'S SETTINGS, READ ONCE
// (lane DRILL-ADOPT; program DRILL-FINISH decisions 5, 8, 16, 28; VERIFY-DRILL-WAVE2 W2-5).
//
// Every line the explorer draws by is a feature knob an organization can move, never a constant:
//   drill.chart      top_n          series a chart draws before Other            (MatrxDrillChart seriesLimit)
//   drill.pareto     share_pct      the share the Pareto line marks               (answer table `pareto`)
//   drill            pivot_columns  pivot columns before the rest column          (answer table `pivotColumnCap`)
//   drill.auto_grain hour_max_days / day_max_days / week_max_days — the window lengths up to which a
//                    time group reads by hour, by day, by week (longer: by month)  (grain.ts)
// A knob that cannot be read is SAID, in words, with what the screen does instead (the package's own
// line) — a missing knob is never silent (lib/knobs/featureKnobs.ts: a missing knob raises).

import { useEffect, useState } from "react";

import { knobNumber } from "@/lib/knobs/featureKnobs";

import type { DrillGrainLines } from "./grain";

export interface DrillKnobs {
  /** False until every read answered (a value or a failure). */
  settled: boolean;
  chartTopN: number | null;
  paretoSharePct: number | null;
  pivotColumns: number | null;
  /** The auto-grain lines, or null when any of them could not be read (the package's own lines then). */
  grainLines: DrillGrainLines | null;
  /** Each knob that could not be read, in words, with what the screen does instead. */
  says: string[];
}

const READS = [
  { feature: "drill.chart", key: "top_n", instead: "the chart draws the package's 10 series before Other" },
  { feature: "drill.pareto", key: "share_pct", instead: "the Pareto line is left out" },
  { feature: "drill", key: "pivot_columns", instead: "a pivot keeps the package's 24 columns" },
  { feature: "drill.auto_grain", key: "hour_max_days", instead: "time reads at the package's own grain lines" },
  { feature: "drill.auto_grain", key: "day_max_days", instead: "time reads at the package's own grain lines" },
  { feature: "drill.auto_grain", key: "week_max_days", instead: "time reads at the package's own grain lines" },
] as const;

type Got = { ok: true; value: number } | { ok: false; message: string };

let shared: Promise<Got[]> | null = null;
let sharedAt = 0;
/** One read of the six per minute, shared by every explorer on the page (the knob cache is 60 s too). */
function readAll(): Promise<Got[]> {
  if (!shared || Date.now() - sharedAt > 60_000) {
    sharedAt = Date.now();
    shared = Promise.all(
      READS.map((r) =>
        knobNumber(r.feature, r.key).then(
          (value): Got => ({ ok: true, value }),
          (e: unknown): Got => ({ ok: false, message: e instanceof Error ? e.message : String(e) }),
        ),
      ),
    );
  }
  return shared;
}

/** The knobs as the explorer reads them, from the six answers (pure, for tests). */
export function drillKnobsOf(got: readonly Got[]): Omit<DrillKnobs, "settled"> {
  const says: string[] = [];
  let grainSaid = false;
  const value = (i: number): number | null => {
    const g = got[i];
    if (g?.ok) return g.value;
    const r = READS[i]!;
    // the three grain lines share one consequence: said once
    if (r.feature === "drill.auto_grain") {
      if (grainSaid) return null;
      grainSaid = true;
    }
    const message = g && !g.ok ? g.message : "no answer";
    // a setting not seeded on this database yet reads in one short line, not the resolver's whole remedy
    const why = /missing feature knob/i.test(message) ? "is not on this database yet" : `could not be read (${message})`;
    says.push(`The setting ${r.feature}.${r.key} ${why}, so ${r.instead}.`);
    return null;
  };
  const chartTopN = value(0);
  const paretoSharePct = value(1);
  const pivotColumns = value(2);
  const hour = value(3);
  const day = value(4);
  const week = value(5);
  return {
    chartTopN,
    paretoSharePct,
    pivotColumns,
    grainLines: hour !== null && day !== null && week !== null ? { hourMaxDays: hour, dayMaxDays: day, weekMaxDays: week } : null,
    says,
  };
}

export function useDrillKnobs(): DrillKnobs {
  const [held, setHeld] = useState<DrillKnobs>({ settled: false, chartTopN: null, paretoSharePct: null, pivotColumns: null, grainLines: null, says: [] });
  useEffect(() => {
    let cancelled = false;
    void readAll().then((got) => {
      if (!cancelled) setHeld({ settled: true, ...drillKnobsOf(got) });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return held;
}
