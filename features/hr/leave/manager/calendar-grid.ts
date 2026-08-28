/**
 * features/hr/leave/manager/calendar-grid.ts — the who's-out calendar's date arithmetic.
 *
 * Pure, and separate from the component so it can be reasoned about (and tested) without a
 * React tree. It does date arithmetic ONLY — it never decides what an entry says, who may see
 * it, or whether it is a door. `hr.leave_calendar` has already applied §10's disclosure ladder
 * server-side; this file lays what it returned onto a grid.
 *
 * 🚨 EVERY DATE IS AN ISO `YYYY-MM-DD` STRING AND IS ANCHORED AT UTC NOON.
 * `hr.leave_request.starts_on` / `ends_on` are `date` columns — days, not instants. Parsing
 * `"2026-08-27"` with `new Date(...)` in a browser west of Greenwich yields the previous
 * evening local, and a month grid built from that renders every absence a day early. Noon UTC
 * is far enough from either boundary that no offset in use can move the calendar day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` → a Date anchored at 12:00 UTC on that calendar day. */
export function parseIsoDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
}

export function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIsoDay(new Date(parseIsoDay(iso).getTime() + days * DAY_MS));
}

export function todayIso(): string {
  const now = new Date();
  return toIsoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)));
}

/** 0 = Sunday. The grid starts on Sunday, matching the rest of the product's calendars. */
export function weekdayOf(iso: string): number {
  return parseIsoDay(iso).getUTCDay();
}

export function startOfMonth(iso: string): string {
  const date = parseIsoDay(iso);
  return toIsoDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
}

export function endOfMonth(iso: string): string {
  const date = parseIsoDay(iso);
  return toIsoDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

export function addMonths(iso: string, months: number): string {
  const date = parseIsoDay(iso);
  // Clamp to the last day of the target month so 31 Jan + 1 month is 28/29 Feb, not 3 March.
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  return toIsoDay(
    new Date(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        Math.min(date.getUTCDate(), lastDay),
        12,
      ),
    ),
  );
}

export interface CalendarRange {
  /** What the door is asked for — the whole grid, including the leading/trailing spill days. */
  from: string;
  to: string;
  /** The days in the grid, in order. */
  days: string[];
  /** The month the grid is anchored on, for dimming spill days. `null` in week view. */
  anchorMonth: number | null;
  anchorYear: number | null;
}

/** A six-week month grid, Sunday-first, including the spill days either side. */
export function monthGrid(anchor: string): CalendarRange {
  const first = startOfMonth(anchor);
  const from = startOfWeek(first);
  const days: string[] = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(from, i));
  const anchorDate = parseIsoDay(anchor);
  return {
    from,
    to: days[days.length - 1],
    days,
    anchorMonth: anchorDate.getUTCMonth(),
    anchorYear: anchorDate.getUTCFullYear(),
  };
}

/** One Sunday-first week. */
export function weekGrid(anchor: string): CalendarRange {
  const from = startOfWeek(anchor);
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) days.push(addDays(from, i));
  return { from, to: days[6], days, anchorMonth: null, anchorYear: null };
}

/** True when `day` falls inside `[startsOn, endsOn]` inclusive. Missing bounds mean no. */
export function coversDay(
  day: string,
  startsOn: string | null,
  endsOn: string | null,
): boolean {
  if (!startsOn) return false;
  const end = endsOn ?? startsOn;
  return day >= startsOn && day <= end;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(iso: string): string {
  const date = parseIsoDay(iso);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function weekLabel(iso: string): string {
  const from = parseIsoDay(startOfWeek(iso));
  const to = parseIsoDay(addDays(startOfWeek(iso), 6));
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const fromPart = `${MONTH_NAMES[from.getUTCMonth()]} ${from.getUTCDate()}`;
  const toPart = sameMonth
    ? `${to.getUTCDate()}`
    : `${MONTH_NAMES[to.getUTCMonth()]} ${to.getUTCDate()}`;
  return `${fromPart} – ${toPart}, ${to.getUTCFullYear()}`;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
