// features/admin/spend/format.ts
//
// Money and time formatting for the spend surfaces. One place, so the popover
// and the dashboard can never disagree about what $144.85 looks like.
//
// Doc: features/admin/spend/FEATURE.md

import { formatCount, formatRelativeTime, formatUsd } from "@ai-matrx/kit/format";

/**
 * `$144.85`. A null is "not measured" — never rendered as $0.00.
 *
 * A THIN OPTION-BINDING WRAPPER over `@ai-matrx/kit/format`, not a formatter:
 * what it binds is this surface's own word for an unmeasured value ("not
 * measured" rather than an em-dash), which is a statement about the spend
 * ledger and not about money. The two hand-built `Intl.NumberFormat`s and the
 * hand-rolled sub-cent branch that used to live here were found by the money
 * shape lane of `check:package-twins`.
 */
export function usd(value: number | null | undefined): string {
  return formatUsd(value, { unknown: "not measured" });
}

/**
 * Keeps sub-cent amounts visible so a $0.004 ledger does not read as $0.00.
 *
 * THE BODY THIS REPLACES DID NOT KEEP THAT PROMISE: it capped at four decimal
 * places, so `usdPrecise(0.000004)` returned "$0.00" — the exact failure the
 * comment says it exists to stop. `digits: "adaptive"` gives two decimals at a
 * dollar or more, four down to a cent and six below that, so the same value now
 * reads "$0.000004".
 */
export function usdPrecise(value: number | null | undefined): string {
  return formatUsd(value, { digits: "adaptive", unknown: "not measured" });
}

/** A localized item count, with an honest absence when the ledger is unknown. */
export function count(value: number | null | undefined): string {
  return formatCount(value, { unknown: "not measured" });
}

/** `+18%` / `−7%` against yesterday. Null when yesterday was zero. */
export function deltaPercent(today: number, yesterday: number): number | null {
  if (!Number.isFinite(yesterday) || yesterday === 0) return null;
  return ((today - yesterday) / yesterday) * 100;
}

export function formatDelta(percent: number | null): string {
  if (percent === null) return "no comparison";
  const rounded = Math.round(percent);
  if (rounded === 0) return "level with yesterday";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}% vs yesterday`;
}

/** Compact table time: `09/11/26 · 9:45 PM`, or the honest absence. */
export function timestamp(value: string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  const formatted = date.toLocaleString("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatted.replace(", ", " · ").replaceAll(" ", "\u00a0");
}

/**
 * `3 days ago` — how stale a ledger's last write is.
 *
 * THE BODY THIS REPLACES LIED ABOUT THE FUTURE: it floored an epoch delta into
 * whole days and returned "today" for anything at or below zero, so a stamp
 * AHEAD of the clock read "today" instead of "in 2 days". kit's `long` voice
 * speaks both directions and has a sub-minute skew band, which is what that
 * branch was reaching for.
 */
export function staleness(value: string | null | undefined): string {
  return formatRelativeTime(value, { style: "long", fallback: "never written" });
}

/** A human name for the zone the day boundary was cut in. */
export function zoneLabel(timezone: string): string {
  return timezone.replace(/_/g, " ");
}
