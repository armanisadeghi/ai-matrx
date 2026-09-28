import { addDaysToKey, dayKeyInZone, eventLocalDay, eventTimeText } from "./record";
import type { CalendarEventRow } from "./types";

export type CalendarViewMode = "day" | "week";

export interface CalendarEventSegment {
  event: CalendarEventRow;
  day: string;
  allDay: boolean;
  startMinute: number;
  endMinute: number;
}

export interface PositionedCalendarEvent extends CalendarEventSegment {
  lane: number;
  lanes: number;
}

/** A UTC-built date is only a carrier for the local calendar-day key. */
export function dateForCalendarDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1, 12));
}

const DAY_START_CACHE = new Map<string, number>();

/**
 * The instant at which this IANA-zone calendar day begins. `Date` cannot build
 * a zoned midnight itself, so find the first instant that Intl formats as the
 * requested day. This keeps the DST boundary in one testable place.
 */
function dayStartInstant(day: string, timeZone: string): Date {
  const cacheKey = `${timeZone}:${day}`;
  const cached = DAY_START_CACHE.get(cacheKey);
  if (cached !== undefined) return new Date(cached);

  const centre = dateForCalendarDay(day).getTime();
  let before = centre - 48 * 3_600_000;
  let after = centre + 48 * 3_600_000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dayKeyInZone(new Date(middle), timeZone) < day) before = middle;
    else after = middle;
  }
  DAY_START_CACHE.set(cacheKey, after);
  return new Date(after);
}

/** Actual elapsed minutes in a local calendar day: 23, 24, or 25 hours at DST. */
export function calendarDayDurationMinutes(day: string, timeZone: string): number {
  const start = dayStartInstant(day, timeZone).getTime();
  const next = dayStartInstant(addDaysToKey(day, 1), timeZone).getTime();
  return (next - start) / 60_000;
}

export interface CalendarHourTick {
  minute: number;
  label: string;
}

export interface CalendarTimelineAxes {
  /** An ordinary 24-hour day supplies the shared Week gutter when one exists. */
  sharedDay: string | null;
  /** DST transition days require labels in their own column. */
  columnDays: string[];
}

/**
 * Hour lines are instants after local midnight, rather than clock-hour labels.
 * A fall-back day therefore has two distinct 1 AM ticks, while spring-forward
 * simply has no tick for the local hour that never occurred.
 */
export function calendarHourTicks(day: string, timeZone: string): CalendarHourTick[] {
  const start = dayStartInstant(day, timeZone).getTime();
  const end = dayStartInstant(addDaysToKey(day, 1), timeZone).getTime();
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    timeZoneName: "short",
  });
  const ticks: CalendarHourTick[] = [];
  for (let instant = start; instant < end; instant += 60 * 60_000) {
    ticks.push({ minute: (instant - start) / 60_000, label: formatter.format(new Date(instant)) });
  }
  return ticks;
}

/**
 * A shared Week gutter can only describe a 24-hour day honestly. Transition
 * days retain their own axes so a repeated or missing local hour is visible.
 */
export function calendarTimelineAxes(days: readonly string[], timeZone: string): CalendarTimelineAxes {
  const sharedDay = days.find((day) => calendarDayDurationMinutes(day, timeZone) === 1440) ?? null;
  return {
    sharedDay,
    columnDays: days.filter((day) => sharedDay === null || calendarDayDurationMinutes(day, timeZone) !== 1440),
  };
}

export function calendarDays(startDay: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDaysToKey(startDay, index));
}

export function calendarDayLabel(day: string, compact = false): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: compact ? "short" : "long",
    month: compact ? undefined : "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1)));
}

function endDayOf(event: CalendarEventRow, startDay: string, timeZone: string): string {
  if (!event.ends_at) return startDay;
  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) return startDay;
  const start = event.starts_at ? new Date(event.starts_at) : null;
  if (start && end.getTime() <= start.getTime()) return startDay;
  // Google treats all-day ends as exclusive dates. Timed midnight ends are also
  // exclusive, so subtract one millisecond to keep a meeting out of tomorrow.
  return event.all_day
    ? dayKeyInZone(new Date(end.getTime() - 1), "UTC")
    : dayKeyInZone(new Date(end.getTime() - 1), timeZone);
}

/**
 * Splits events across every local day they cover. This is the view's one
 * source of truth for all-day, multi-day and timed events.
 */
export function calendarSegments(
  events: readonly CalendarEventRow[],
  days: readonly string[],
  timeZone: string,
): CalendarEventSegment[] {
  const visible = new Set(days);
  const out: CalendarEventSegment[] = [];
  for (const event of events) {
    const startDay = eventLocalDay(event, timeZone);
    if (!startDay) continue;
    const endDay = endDayOf(event, startDay, timeZone);
    const start = event.starts_at ? new Date(event.starts_at) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const suppliedEnd = event.ends_at ? new Date(event.ends_at) : null;
    const end = suppliedEnd && !Number.isNaN(suppliedEnd.getTime()) && suppliedEnd > start
      ? suppliedEnd
      : new Date(start.getTime() + 15 * 60_000);
    for (let day = startDay; day <= endDay; day = addDaysToKey(day, 1)) {
      if (!visible.has(day)) continue;
      if (event.all_day) {
        out.push({ event, day, allDay: true, startMinute: 0, endMinute: 1440 });
        continue;
      }
      const dayStart = dayStartInstant(day, timeZone);
      const dayEnd = dayStartInstant(addDaysToKey(day, 1), timeZone);
      const segmentStart = start > dayStart ? start : dayStart;
      const segmentEnd = end < dayEnd ? end : dayEnd;
      if (segmentEnd <= segmentStart) continue;
      // Both placement and height are elapsed time from this day's local
      // midnight instant. A fall-back day has two 1:30 AM instants 60 minutes
      // apart, and they must have different positions rather than overlap.
      const startMinute = (segmentStart.getTime() - dayStart.getTime()) / 60_000;
      const endMinute = (segmentEnd.getTime() - dayStart.getTime()) / 60_000;
      out.push({ event, day, allDay: false, startMinute, endMinute });
    }
  }
  return out;
}

export function calendarEventAccessibleName(
  event: CalendarEventRow,
  day: string,
  timeZone: string,
): string {
  if (event.all_day || !event.starts_at) {
    return `${calendarDayLabel(day)}: ${eventTimeText(event, timeZone)}: ${event.title || "Untitled event"}`;
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const timeRange = Number.isNaN(start.getTime())
    ? eventTimeText(event, timeZone)
    : end && !Number.isNaN(end.getTime())
      ? `${formatter.format(start)} – ${formatter.format(end)}`
      : formatter.format(start);
  return `${calendarDayLabel(day)}: ${timeRange}: ${event.title || "Untitled event"}`;
}

/** Positions colliding timed segments side-by-side so neither meeting disappears. */
export function positionTimedSegments(
  segments: readonly CalendarEventSegment[],
): PositionedCalendarEvent[] {
  const ordered = [...segments].sort(
    (left, right) => left.startMinute - right.startMinute || right.endMinute - left.endMinute,
  );
  const laneEnds: number[] = [];
  const placed = ordered.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.endMinute;
    return { ...segment, lane, lanes: 1 };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((segment) => ({ ...segment, lanes }));
}
