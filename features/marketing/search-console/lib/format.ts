/**
 * Date-window formatting for the Search Console surface. GSC dates are
 * property-timezone DAYS carried as `YYYY-MM-DD` strings — formatting must
 * stay in UTC parts. `new Date("2026-07-09")` parses as UTC midnight, so any
 * local-timezone formatter (e.g. the shared `formatCompactDate`, which also
 * appends a time of day) renders it as the PREVIOUS day west of UTC. That
 * exact off-by-one shipped in the header's resolved-window label.
 */

import type {
  GscDateRange,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parts(iso: string): DateParts | null {
  // Tolerate a trailing timestamp (`2026-07-26T00:00:00Z`) — some rollup
  // columns carry one — but only ever read the DAY, in UTC.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month, day: Number(match[3]) };
}

/** `2026-07-09` → `Jul 9, 2026`. Unparseable input → `—`. */
export function formatGscDate(iso: string | null): string {
  const p = iso ? parts(iso) : null;
  if (!p) return "—";
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

/**
 * A window as humans write one: `Jul 9 – Aug 5, 2026` (year stated once when
 * shared), `Dec 20, 2025 – Jan 16, 2026` across years, a single date when
 * start = end.
 */
export function formatGscWindow(range: GscDateRange): string {
  const start = parts(range.start);
  const end = parts(range.end);
  if (!start || !end) return `${formatGscDate(range.start)} – ${formatGscDate(range.end)}`;
  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return formatGscDate(range.start);
  }
  if (start.year === end.year) {
    return `${MONTHS[start.month - 1]} ${start.day} – ${MONTHS[end.month - 1]} ${end.day}, ${end.year}`;
  }
  return `${formatGscDate(range.start)} – ${formatGscDate(range.end)}`;
}

/**
 * Empty-state prose: `between Jul 9 and Aug 5, 2026` (or `on Jul 9, 2026`
 * for a one-day window). Every "found nothing" in this feature names the
 * window it found nothing in — an undated empty result reads as broken
 * instead of as "nothing in the last 28 days".
 */
export function describeGscWindow(range: GscDateRange): string {
  const start = parts(range.start);
  const end = parts(range.end);
  if (start && end && range.start === range.end) {
    return `on ${formatGscDate(range.start)}`;
  }
  if (start && end && start.year === end.year) {
    return `between ${MONTHS[start.month - 1]} ${start.day} and ${MONTHS[end.month - 1]} ${end.day}, ${end.year}`;
  }
  return `between ${formatGscDate(range.start)} and ${formatGscDate(range.end)}`;
}

/**
 * The one sentence the period strip prints: current window, compare window
 * (or "no compare"), and whether the compare was auto-derived.
 */
export function describeGscPeriods(
  periods: GscResolvedPeriods,
  compareAuto: boolean,
): string {
  const current = formatGscWindow(periods.current);
  if (!periods.compare) return `Evaluating ${current} · no compare`;
  const compare = formatGscWindow(periods.compare);
  return `Evaluating ${current} vs ${compare}${
    compareAuto ? " (auto — previous period of the same length)" : ""
  }`;
}
