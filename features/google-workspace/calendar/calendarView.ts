import { addDaysToKey, dayKeyInZone, eventLocalDay } from "./record";
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

function minuteInZone(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
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
    const end = event.ends_at ? new Date(event.ends_at) : null;
    for (let day = startDay; day <= endDay; day = addDaysToKey(day, 1)) {
      if (!visible.has(day)) continue;
      const startMinute = event.all_day || day !== startDay || !start ? 0 : minuteInZone(start, timeZone);
      const endMinute = event.all_day || day !== endDay || !end ? 1440 : Math.max(startMinute + 15, minuteInZone(end, timeZone));
      out.push({ event, day, allDay: event.all_day, startMinute, endMinute: Math.min(1440, endMinute) });
    }
  }
  return out;
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
