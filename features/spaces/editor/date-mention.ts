// features/spaces/editor/date-mention.ts — "@today", "@tomorrow", "@yesterday" and "@<date>" (N2): what the
// "@" menu offers under Date for what was typed. A date mention stores `{ kind: "date", iso: "YYYY-MM-DD" }`
// (lib/spaces-blocks SpaceMention) and reads, like Notion, as Today / Tomorrow / Yesterday, else the date.

import type { SpaceRemindOffset } from "@/lib/spaces-blocks/types";

import { dayKeyInZone, wallClockInZone } from "@/lib/time/personTimeZone";

// Every "today" here is the PERSON's day (their saved time zone — `usePersonTimeZone()`), never the device's
// clock: a date mention typed at 11 pm in Los Angeles by someone whose zone is Tokyo is tomorrow's date.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a calendar date held as a UTC-midnight Date (zone-free day arithmetic). */
export function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const dayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const addDays = (iso: string, n: number) => {
  const d = dayOf(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};

/** A typed date: 2026-10-12, 10/12, 10/12/2026, oct 12, october 12 2026, 12 oct. Null when it is none. */
export function parseTypedDate(raw: string, now: Date, zone: string): Date | null {
  const q = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!q) return null;
  const thisYear = +dayKeyInZone(zone, now).slice(0, 4);
  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  m = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) return valid(m[3] ? year(+m[3]) : thisYear, +m[1] - 1, +m[2]);
  m = q.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/) ?? null;
  if (m && monthOf(m[1]) >= 0) return valid(m[3] ? +m[3] : thisYear, monthOf(m[1]), +m[2]);
  m = q.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/);
  if (m && monthOf(m[2]) >= 0) return valid(m[3] ? +m[3] : thisYear, monthOf(m[2]), +m[1]);
  return null;
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
const monthOf = (w: string) => MONTHS.findIndex((m) => w.startsWith(m) && m.startsWith(w.slice(0, 3)));
function valid(y: number, mo: number, d: number): Date | null {
  const out = new Date(Date.UTC(y, mo, d));
  return out.getUTCFullYear() === y && out.getUTCMonth() === mo && out.getUTCDate() === d ? out : null;
}

/** The Date group of the "@" menu for `query`, in the person's zone: label shown, and the day it inserts. */
export function dateChoices(query: string, now: Date, zone: string): Array<{ title: string; iso: string }> {
  const q = query.trim().toLowerCase();
  const today = dayKeyInZone(zone, now);
  const named = [
    { title: "Today", iso: today },
    { title: "Tomorrow", iso: addDays(today, 1) },
    { title: "Yesterday", iso: addDays(today, -1) },
  ];
  const typed = parseTypedDate(q, now, zone);
  if (typed) return [{ title: dateWords(isoDay(typed), now, zone), iso: isoDay(typed) }];
  return named.filter((c) => !q || c.title.toLowerCase().startsWith(q));
}

/** How a date mention reads in the person's zone: Today / Tomorrow / Yesterday, else "October 12, 2026". */
export function dateWords(iso: string, now: Date, zone: string): string {
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(dayOf(day).getTime())) return iso;
  const today = dayKeyInZone(zone, now);
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return dayOf(day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// ── Remind (N2, Notion's "Remind" on a date) ──────────────────────────────────────────────────────────

/** Notion's choices, in its order. A day with no time counts from 9:00 that morning, as in Notion. */
export const REMIND_CHOICES: ReadonlyArray<{ value: SpaceRemindOffset | "none"; label: string }> = [
  { value: "none", label: "None" },
  { value: "at", label: "At time of event" },
  { value: "5m", label: "5 minutes before" },
  { value: "1h", label: "1 hour before" },
  { value: "1d", label: "1 day before" },
  { value: "2d", label: "2 days before" },
  { value: "1w", label: "1 week before" },
];

const OFFSET_MS: Record<SpaceRemindOffset, number> = {
  at: 0,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "2d": 2 * 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

/**
 * The moment a date mention stands for: its wall time in the person's zone ("YYYY-MM-DDTHH:mm"), else 9:00
 * that morning in their zone. Null when unreadable.
 */
export function eventTime(iso: string, zone: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0];
  // The instant whose wall clock in `zone` reads y-mo-d h:mi: start from that wall time read as UTC and
  // move by the zone's offset (twice, so a daylight-saving edge settles).
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let at = wall;
  for (let i = 0; i < 2; i++) {
    const w = wallClockInZone(zone, new Date(at));
    at += wall - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  }
  const out = new Date(at);
  return Number.isNaN(out.getTime()) ? null : out;
}

/** When the reminder fires. */
export function remindAt(iso: string, offset: SpaceRemindOffset, zone: string): Date | null {
  const t = eventTime(iso, zone);
  return t ? new Date(t.getTime() - OFFSET_MS[offset]) : null;
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" from a day and an optional "HH:mm". */
export function joinDayTime(day: string, time: string): string {
  return time ? `${day}T${time}` : day;
}

/** How a date mention reads with its time, in the person's zone: "Tomorrow 3:00 PM". */
export function dateTimeWords(iso: string, now: Date, zone: string): string {
  if (iso.length === 10) return dateWords(iso, now, zone);
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = +m[1];
  return `${dateWords(iso.slice(0, 10), now, zone)} ${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
