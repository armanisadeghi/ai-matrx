/**
 * features/hr/time/shared/format.ts — DISPLAY formatting for the timesheet, punch and exception
 * surfaces.
 *
 * 🚨 THE LINE THIS FILE MAY NOT CROSS (SPEC-TIME §0 law 6, §9.2, L3-74).
 * ---------------------------------------------------------------------
 * Nothing here computes hours, overtime, premiums, rounding, categorization or a weighted average.
 * There is no timestamp subtraction, no `differenceInMinutes`, no `hours × rate`, and no summing of
 * hours across rows. Every number these helpers touch arrived **already computed** from an RPC;
 * these functions only decide how it is spelled on screen.
 *
 * Subtracting `ended_at − started_at` in a browser returns 8 for a spring-forward night shift that
 * was 7 (fixture `OT-DST-01`). That is why the rule is absolute rather than a guideline.
 *
 * ♻️ REUSE, NOT A SECOND COPY. Rendering an instant in its **stamped** zone already exists at
 * `../clock/stampedTime.ts` (the clock lane wrote it first, against the same §9 rule 1). This
 * module imports those functions rather than growing a rival set — two spellings of
 * `5:58 AM PDT` in one feature is the fork `docs/reuse-first.md` exists to prevent.
 * DEBT (lane owner): `clock/stampedTime.ts` is used by three lanes now and belongs in `shared/`.
 */

import { viewerTimeZone } from "../clock/stampedTime";

/** True when the record's stamped zone is not the zone the reader is sitting in. */
export function zoneDiffersFromViewer(tz: string): boolean {
  return tz !== viewerTimeZone();
}

/**
 * The same instant spelled in the **viewer's** own zone — the hover equivalent §9 rule 1 requires
 * beside every cross-zone time. It is never the primary rendering.
 */
export function formatTimeInViewerZone(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/**
 * Date + time + seconds in the stamped zone — the evidence lane needs the seconds, because
 * `occurred_at` and `device_reported_at` routinely differ by a few of them and that difference is
 * the whole point of the `clock_skew_applied_seconds` column beside them.
 */
export function formatStampedDateTimeExact(iso: string | null, tz: string): string {
  if (!iso) return "—";
  const showZone = zoneDiffersFromViewer(tz);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
    ...(showZone ? { timeZoneName: "short" as const } : {}),
  }).format(new Date(iso));
}

/**
 * A `local_work_date` / `period_start_on` style plain date string (`2026-03-17`).
 *
 * Anchored to UTC deliberately: the string carries no instant, so pinning it to UTC midnight and
 * printing it in UTC is the only rendering that cannot slide a day backwards for a reader west of
 * Greenwich. `formatStampedDate` is for real instants; this is for calendar dates.
 */
export function formatLocalDate(
  date: string | null,
  opts: { weekday?: boolean; year?: boolean } = {},
): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Short day-column heading: `Tue 17`. */
export function formatDayColumn(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

const DOW = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The **stamped** workweek start, named in words — `Sunday at 12:00 AM`.
 *
 * SPEC-TIME §5.1: an org that changed the setting later has weeks cut both ways in its history, so
 * the week block's header names what THIS week was actually cut on, never today's configuration.
 */
export function formatWeekStart(dow: number, time: string): string {
  const day = DOW[dow] ?? `day ${dow}`;
  const [hh, mm] = time.split(":");
  const hour = Number(hh);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} at ${display}:${mm ?? "00"} ${suffix}`;
}

/** Hours exactly as the server computed them. Two decimals everywhere, so a column reads straight. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  return hours.toFixed(2);
}

/**
 * Currency for an amount the server already produced.
 *
 * ⚠️ DEBT (lane owner): no contract in this lane carries a currency code, so USD is assumed. When
 * `hr.work_interval` grows one this helper takes it as an argument — the assumption is written in
 * exactly one place for that reason.
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${formatMoney(rate)}/hr`;
}

/**
 * 🚨 Variance, in WORDS (SPEC-TIME §6.2, L3-52).
 *
 * `null` is **"Not scheduled"** and never `0` — a zero reads as perfect adherence, which is the
 * opposite of "there is no schedule to compare against". The sign is explained rather than printed,
 * because a bare `-35` does not tell a manager whether the person was short or long.
 */
export function formatVariance(minutes: number | null): string {
  if (minutes === null) return "Not scheduled";
  if (minutes === 0) return "Exactly on schedule";
  const abs = Math.abs(minutes);
  const unit = abs === 1 ? "minute" : "minutes";
  return minutes > 0
    ? `${abs} ${unit} over schedule`
    : `${abs} ${unit} under schedule`;
}

/** The signed rounding delta, spelled the way SPEC-TIME §10 spells it: `+1 minute`. */
export function formatRoundingDelta(minutes: number): string {
  const abs = Math.abs(minutes);
  const unit = abs === 1 ? "minute" : "minutes";
  return `${minutes > 0 ? "+" : "−"}${abs} ${unit}`;
}

/**
 * Sentence-case a vocabulary token — for a HEADING or a filter option only.
 * 🚨 Never for a data cell: LAW 3a is that no cell prints a type name, and every interval,
 * exception and punch row carries a human label from the server for exactly that reason.
 */
export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `1 exception` / `4 exceptions` — counting rows is not computing hours. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
