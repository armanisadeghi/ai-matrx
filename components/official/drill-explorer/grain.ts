// components/official/drill-explorer/grain.ts — THE GRAIN A WINDOW READS BEST AT
// (lane DRILL-EXPLORER; lane DRILL-ADOPT: the package helper adopted, its lines made settings).
//
// A time group asked with no grain (`by=at`) reads at the grain its window reads best at. The lines
// (up to N days by hour, by day, by week; longer by month) are the knobs `drill.auto_grain.*`
// (VERIFY-DRILL-WAVE2 W2-5). While they cannot be read, the package's own `drillAutoGrain` decides
// (its lines: 2 / 90 / 366 days) — and useDrillKnobs says so on screen. Either way the grain steps
// to the nearest coarser one the Dimension offers (a date column never reads by hour).

import type { DrillDefinition } from "@ai-matrx/records";
import {
  MATRX_DRILL_GRAINS,
  drillAutoGrain,
  drillWindowRange,
  type MatrxDrillGrain,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

/** The window lengths, in days, up to which a time group reads by hour, by day and by week. */
export interface DrillGrainLines {
  hourMaxDays: number;
  dayMaxDays: number;
  weekMaxDays: number;
}

/** `grain`, or the nearest coarser grain `offered` has (finest first, as MATRX_DRILL_GRAINS). */
function clampToOffered(grain: MatrxDrillGrain, offered: readonly string[] | undefined): MatrxDrillGrain {
  if (!offered || offered.length === 0) return grain;
  const order = MATRX_DRILL_GRAINS as readonly MatrxDrillGrain[];
  const from = order.indexOf(grain);
  for (let i = from; i < order.length; i++) if (offered.includes(order[i]!)) return order[i]!;
  // nothing coarser: the coarsest offered
  return [...order].reverse().find((g) => offered.includes(g)) ?? grain;
}

/** The grain a window reads best at, by the settings' lines (or the package's while they are unread). */
export function drillExplorerAutoGrain(
  window: string | null | undefined,
  lines: DrillGrainLines | null,
  offered?: readonly string[],
  now: Date = new Date(),
): MatrxDrillGrain {
  if (!lines) return drillAutoGrain(window, now, offered as readonly MatrxDrillGrain[] | undefined);
  const range = drillWindowRange(window, now);
  if (!range) return clampToOffered("month", offered);
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  const grain: MatrxDrillGrain =
    !Number.isFinite(days) ? "month" : days <= lines.hourMaxDays ? "hour" : days <= lines.dayMaxDays ? "day" : days <= lines.weekMaxDays ? "week" : "month";
  return clampToOffered(grain, offered);
}

/**
 * A time group asked with no grain (`by=at`) reads at the grain its window reads best at. The hook
 * and the table both use this, so the answers are keyed exactly as the table asks for them.
 */
export function withAutoGrain(def: DrillDefinition | null, q: MatrxDrillQuestion, lines: DrillGrainLines | null, now: Date = new Date()): MatrxDrillQuestion {
  const time = new Map((def?.dimensions ?? []).filter((d) => d.kind === "time").map((d) => [d.key, d.grains as readonly string[] | undefined]));
  const fix = (ref: string) => (time.has(ref) ? `${ref}:${drillExplorerAutoGrain(q.window ?? null, lines, time.get(ref), now)}` : ref);
  return { ...q, by: q.by.map(fix), across: q.across ? fix(q.across) : q.across };
}

/** The time reference a chart runs along when the question groups by no time (`at:day`), or null. */
export function autoTimeRef(def: DrillDefinition | null, q: MatrxDrillQuestion, lines: DrillGrainLines | null, now: Date = new Date()): string | null {
  const dim = (def?.dimensions ?? []).find((d) => d.kind === "time");
  if (!dim) return null;
  return `${dim.key}:${drillExplorerAutoGrain(q.window ?? null, lines, dim.grains as readonly string[] | undefined, now)}`;
}
