

import { downloadFile } from "@ai-matrx/kit/download";
// lib/calendar/eventLinks.ts
//
// "ADD TO CALENDAR" — ONE builder for every surface that hands a person an
// event: a meeting invitation today, a booking or a webinar tomorrow. Pure
// functions, no React, no network: a Google Calendar link, an Outlook web
// link, and an RFC 5545 `.ics` file (which Apple Calendar, Outlook desktop and
// every other client open).
//
// A one-off event is written in UTC (`...Z`), so the file means the same instant
// in every calendar regardless of the viewer's zone. A REPEATING event is written
// in its own zone (`DTSTART;TZID=America/Los_Angeles:…`) with its RRULE, because a
// series authored as "Tuesdays 10:00 in Los Angeles" must stay at 10:00 across a
// DST change — a UTC anchor would slide it an hour for half the year.

export interface CalendarEvent {
  /** Stable identity, so re-importing the same event updates it instead of duplicating. */
  readonly uid: string;
  readonly title: string;
  /** ISO 8601 instant. */
  readonly start: string;
  /** ISO 8601 instant. Must be after `start`. */
  readonly end: string;
  readonly description?: string;
  /** For an online meeting this is its link. */
  readonly location?: string;
  readonly url?: string;
  /** RFC 5545 RRULE body (no `RRULE:` prefix) when the event repeats. */
  readonly rrule?: string | null;
  /** IANA zone the event is authored in; REQUIRED for a repeating event to hold its wall clock. */
  readonly timeZone?: string | null;
  /** A reminder this many minutes before the start (an .ics VALARM); absent = no alarm. */
  readonly alarmMinutesBefore?: number | null;
}

/** Outlook on the web's compose link has no recurrence parameter; a series must use the `.ics`. */
export function outlookWebSupports(event: CalendarEvent): boolean {
  return !event.rrule;
}

/**
 * The rule as a calendar client reads it. A date-only UNTIL (how the meeting
 * form stores "ends on October 30") becomes the end of that day in UTC, because
 * RFC 5545 requires UNTIL to share DTSTART's value type.
 */
export function calendarRrule(rule: string): string {
  return rule
    .trim()
    .replace(/^RRULE:/i, "")
    .replace(/UNTIL=(\d{8})(?=;|$)/i, "UNTIL=$1T235959Z");
}

/** `20261006T100000` — the wall-clock form used with a TZID. */
export function toCalendarLocal(iso: string, timeZone: string): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

/** Default length when a scheduled event carries no duration. */
export const DEFAULT_EVENT_MINUTES = 30;

/** `start + minutes` as an ISO instant. */
export function endFromDuration(
  start: string,
  minutes: number | null | undefined,
): string {
  const ms = new Date(start).getTime();
  const length =
    minutes !== null && minutes !== undefined && minutes > 0
      ? minutes
      : DEFAULT_EVENT_MINUTES;
  return new Date(ms + length * 60_000).toISOString();
}

/** `20260928T170000Z` — the compact UTC form Google and iCalendar both read. */
export function toCalendarUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Calendar event time "${iso}" is not a valid date.`);
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toCalendarUtc(event.start)}/${toCalendarUtc(event.end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  if (event.rrule) {
    params.set("recur", `RRULE:${calendarRrule(event.rrule)}`);
    // Google expands the series in `ctz`, so Tuesdays 10:00 stay 10:00 across DST.
    if (event.timeZone) params.set("ctz", event.timeZone);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: new Date(event.start).toISOString(),
    enddt: new Date(event.end).toISOString(),
  });
  if (event.description) params.set("body", event.description);
  if (event.location) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function icsContent(
  event: CalendarEvent,
  now: Date = new Date(),
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Matrx//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${toCalendarUtc(now.toISOString())}`,
    ...(event.rrule && event.timeZone
      ? [
          `DTSTART;TZID=${event.timeZone}:${toCalendarLocal(event.start, event.timeZone)}`,
          `DTEND;TZID=${event.timeZone}:${toCalendarLocal(event.end, event.timeZone)}`,
        ]
      : [
          `DTSTART:${toCalendarUtc(event.start)}`,
          `DTEND:${toCalendarUtc(event.end)}`,
        ]),
    ...(event.rrule ? [`RRULE:${calendarRrule(event.rrule)}`] : []),
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description
      ? [`DESCRIPTION:${escapeText(event.description)}`]
      : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.alarmMinutesBefore != null && event.alarmMinutesBefore >= 0
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeText(event.title)}`,
          `TRIGGER:-PT${Math.round(event.alarmMinutesBefore)}M`,
          "END:VALARM",
        ]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** A file name a person recognises: "weekly-client-check-in.ics". */
export function icsFileName(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base.length > 0 ? base : "event"}.ics`;
}

/** Hands the person the `.ics` file. Browser only. */
export function downloadIcs(event: CalendarEvent): void {
  const blob = new Blob([icsContent(event)], {
    type: "text/calendar;charset=utf-8",
  });
  downloadFile(icsFileName(event.title), blob, blob.type);
}
