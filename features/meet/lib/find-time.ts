// features/meet/lib/find-time.ts
//
// FIND A TIME — the first open slots that suit everyone, from free/busy only
// (Google Calendar's "Find a time", Outlook's Scheduling Assistant). The busy
// intervals come from `communication.calendar_free_busy` (synced calendars +
// AI Matrx meetings; never an event's title or details); the working day, the
// grid and how many to offer are the person's own knobs. Pure — tested without
// a DOM or a network.

import { utcToZoned, zonedToUtcIso } from "@/features/meet/lib/zoned-time";

export interface BusyInterval {
  readonly userId: string;
  readonly start: number;
  readonly end: number;
}

export interface FreeBusyPerson {
  readonly userId: string;
  /** False: this person shares no organization with the reader — never read. */
  readonly visible: boolean;
  readonly calendarConnected: boolean;
}

export interface FreeBusy {
  readonly people: readonly FreeBusyPerson[];
  readonly busy: readonly BusyInterval[];
}

export interface WorkingHours {
  /** `HH:MM`, 24-hour, on the clock in the meeting's zone. */
  readonly start: string;
  readonly end: string;
  /** ISO weekday numbers, Monday = 1 … Sunday = 7. */
  readonly days: readonly number[];
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: "09:00",
  end: "17:00",
  days: [1, 2, 3, 4, 5],
};

export interface SlotOptions {
  readonly zone: string;
  readonly durationMinutes: number;
  readonly stepMinutes: number;
  readonly count: number;
  readonly horizonDays: number;
  readonly hours: WorkingHours;
  readonly now: Date;
}

export interface Slot {
  /** ISO instant. */
  readonly start: string;
  /** `YYYY-MM-DD` + `HH:MM` in the meeting's zone — what the form holds. */
  readonly date: string;
  readonly time: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `"1,2,3,4,5"` (the knob) → `[1,2,3,4,5]`; anything unreadable → Monday–Friday. */
export function parseWorkingDays(value: unknown): number[] {
  if (typeof value !== "string") return [...DEFAULT_WORKING_HOURS.days];
  const days = value
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return days.length > 0 ? [...new Set(days)].sort() : [...DEFAULT_WORKING_HOURS.days];
}

export function parseClock(value: unknown, fallback: string): string {
  return typeof value === "string" && HHMM.test(value.trim()) ? value.trim() : fallback;
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h! * 60 + m!;
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** The RPC's JSON → the typed shape. Unknown rows are dropped, never guessed. */
export function parseFreeBusy(raw: unknown): FreeBusy {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const people = (Array.isArray(obj.users) ? obj.users : []).flatMap((u) => {
    const r = (u ?? {}) as Record<string, unknown>;
    return typeof r.user_id === "string"
      ? [
          {
            userId: r.user_id,
            visible: r.visible === true,
            calendarConnected: r.calendar_connected === true,
          },
        ]
      : [];
  });
  const busy = (Array.isArray(obj.busy) ? obj.busy : []).flatMap((b) => {
    const r = (b ?? {}) as Record<string, unknown>;
    const start = Date.parse(String(r.starts_at));
    const end = Date.parse(String(r.ends_at));
    return typeof r.user_id === "string" && Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ userId: r.user_id, start, end }]
      : [];
  });
  return { people, busy };
}

/**
 * The first `count` starts, on the `stepMinutes` grid inside the working day,
 * on working days, from now, where NOBODY is busy for the whole meeting.
 * A slot must end inside the working day; days are walked in the meeting's zone
 * so a DST change moves the clock with it.
 */
export function suggestSlots(busy: readonly BusyInterval[], options: SlotOptions): Slot[] {
  const { zone, durationMinutes, stepMinutes, count, horizonDays, hours, now } = options;
  const step = Math.max(5, Math.floor(stepMinutes));
  const length = Math.max(1, Math.floor(durationMinutes)) * 60_000;
  const open = minutesOf(parseClock(hours.start, DEFAULT_WORKING_HOURS.start));
  const close = minutesOf(parseClock(hours.end, DEFAULT_WORKING_HOURS.end));
  const days = new Set(hours.days.length > 0 ? hours.days : DEFAULT_WORKING_HOURS.days);
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const out: Slot[] = [];
  const today = utcToZoned(now.toISOString(), zone).date;
  for (let offset = 0; offset < horizonDays && out.length < count; offset += 1) {
    const date = addDays(today, offset);
    const noon = utcToZoned(zonedToUtcIso(date, "12:00", zone), zone);
    const isoWeekday = noon.weekday === 0 ? 7 : noon.weekday;
    if (!days.has(isoWeekday)) continue;
    for (let at = open; at + durationMinutes <= close && out.length < count; at += step) {
      const time = clockOf(at);
      const iso = zonedToUtcIso(date, time, zone);
      const start = Date.parse(iso);
      if (start <= now.getTime()) continue;
      const end = start + length;
      const clash = sorted.some((b) => b.start < end && b.end > start);
      if (!clash) out.push({ start: iso, date, time });
    }
  }
  return out;
}
