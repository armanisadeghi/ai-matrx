// components/official/drill-explorer/measureFormat.ts — EVERY UNIT THE DRILL CONTRACT CARRIES, FORMATTED
// ONE WAY (lane DRILL-GAPS; PROGRESS-DRILL-FINISH owner rulings under DRILL-CONVERSIONS (c) and
// DRILL-WAVE1-FIXES).
//
// A Measure says its unit in its definition (`unit`); the screen formats by it, so no definition
// writes "(ms)" or "(0 to 1)" into a label and no mount passes a formatter of its own:
//
//   usd         money through the platform's ONE points / $ switch (credits for everyone, a system
//               admin may switch to dollars — Arman, 2026-09-27)
//   tokens      a compact count (12M, as the platform prints token counts)
//   count, characters, and anything unnamed   a plain count (a ratio without a unit keeps 3 figures)
//   ms          a human duration (850ms, 4.2s, 3m 07s, 2h 05m)
//   duration    a length of time in ms — a `span` (latest minus earliest moment), read as `ms` (lane DRILL-SPAN)
//   share       a fraction of 1 as a percent, one decimal (0.1234 → 12.3%)
//   percent     a number already in percent (12.3 → 12.3%)
//   times       a multiplier (6.0×)
//   time        a MOMENT (lane DRILL-PARITY-LAST: "Last active"): the door sends ISO, the row reader
//               turns it into epoch ms (drillRowOf), read here as the viewer's local date and time
//
// ONE VALUE, ONE READING (owner ruling, 2026-09-30, replacing the rows-add-up-to-the-rounded-total
// rule): every value is rounded on its own by its unit's formatter — the header's total, a table
// cell, the coverage line's whole and a drilled group's total read the same wherever the same number
// appears (the BI norm: Stripe, Looker and Amplitude round each cell independently and never
// redistribute remainders).

import { formatAbsoluteDate, formatCount, formatDurationMs, formatPercentFromFraction } from "@ai-matrx/kit/format";

import { formatAdminPoints, formatAdminUsd } from "@/components/cost/formatAdminCost";

export type DrillMoneyUnit = "points" | "usd";

/** The formatter of one Measure unit (money through the one switch). */
/** `rate` is the SUBSCRIBED points rate (`usePointsRate()`), so money fills in when the rate knob lands. */
export function drillUnitFormatter(unit: string | undefined, money: DrillMoneyUnit, rate: number | null): (value: number | null) => string {
  switch (unit) {
    case "usd":
      return (v) => (v === null ? "—" : money === "usd" ? formatAdminUsd(v) : formatAdminPoints(v, rate));
    case "tokens":
      return (v) => (v === null ? "—" : formatCount(v, { style: "compact" }));
    case "ms":
    case "duration":
      return (v) => (v === null ? "—" : formatDurationMs(v, { style: "compact", fallback: "—" }));
    case "share":
      return (v) => (v === null ? "—" : formatPercentFromFraction(v, { digits: 1 }));
    case "percent":
      return (v) => (v === null ? "—" : formatPercentFromFraction(v / 100, { digits: 1 }));
    case "times":
      return (v) => (v === null ? "—" : `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`);
    case "time":
      return (v) => (v === null ? "—" : formatAbsoluteDate(v, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—"));
    case "count":
    case "characters":
      return (v) => (v === null ? "—" : formatCount(v));
    default:
      // a unit the screen does not know yet: the number itself, never rounded away to zero
      return (v) => (v === null ? "—" : Math.abs(v) >= 1000 || Number.isInteger(v) ? formatCount(v) : v.toLocaleString(undefined, { maximumSignificantDigits: 3 }));
  }
}

/** Does a Measure of this unit add up across groups by default? (A share or a multiplier never does.) */
export function drillUnitAdds(unit: string | undefined): boolean {
  return !(unit === "share" || unit === "percent" || unit === "times" || unit === "ms" || unit === "duration" || unit === "time");
}
