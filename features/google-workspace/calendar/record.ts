/**
 * Calendar Planes A + C — the pure logic. No React, no network, no clock of its
 * own: every function that needs "now" is handed one, so the grouping, the
 * midnight boundary and the staleness rule are testable without pretending time
 * passed (same shape as `features/google-workspace/documents/record.ts`).
 *
 * 🚨 THE LIVE COLUMNS ARE NOT THE PLAN'S WORDS. PLAN §4.6 names
 * `source_state`, `last_refreshed_at` and `refreshed_via_account`; the table
 * that was actually built and certified (migration 0766, live since
 * 2026-09-17) spells them `sync_status`, `synced_at` and
 * `synced_via_connection_id`. Everything here reads the LIVE column — including
 * the shared health strip's producer, since lane F-51.
 */

import type { DetailField, DetailRow, DetailSourceHealth } from "@/lib/detail/types";

import {
  CALENDAR_EVENT_ATTENDEES_KIND,
  CALENDAR_RSVPS,
  type AgendaGroup,
  type AttendeePerson,
  type CalendarAttendee,
  type CalendarEventRow,
  type CalendarEventSyncStatus,
  type CalendarRsvp,
} from "./types";

/** The item-presentation / entity token. Google's own noun (PLAN Amendment A2). */
export const CALENDAR_EVENT_TYPE = "calendar_event";

/** The connector product whose grant refreshes these records. */
export const CALENDAR_PRODUCT_KEY = "calendar";

/**
 * The schema-qualified table the server's two generic doors address this
 * record by (`SYNCED_RECORD_TABLES` in aidream's `google_sync/records.py`,
 * same declared set `documents/record.ts`'s `GOOGLE_DOCUMENT_TABLE` names).
 * Sent as a path segment and resolved there — never interpolated.
 */
export const CALENDAR_EVENT_TABLE = "communication.calendar_event";

export function isCalendarEventSyncStatus(
  value: unknown,
): value is CalendarEventSyncStatus {
  return value === "available" || value === "unavailable" || value === "detached";
}

/** The status word, or `unknown` when the column says something we do not know. */
export function syncStatusOf(row: CalendarEventRow): CalendarEventSyncStatus | "unknown" {
  return isCalendarEventSyncStatus(row.sync_status) ? row.sync_status : "unknown";
}

/**
 * PLAN §4.6 / §7 — `google.calendar.agenda_days`, default 7, max 31. The max is
 * the PROVIDER bound: the server refuses a window outside 1..31 days
 * (`CalendarRefreshRequest.days`), so a larger number could never be honoured.
 */
export const DEFAULT_AGENDA_DAYS = 7;
export const MAX_AGENDA_DAYS = 31;
export const MIN_AGENDA_DAYS = 1;

/**
 * The knob address — the register's own PAIR, never a dotted string a helper
 * re-splits (`lib/scoped-config/effectiveKnobs.ts` splits at the last dot, which
 * is right for this key and is not something to depend on).
 *
 * The OTHER knob this surface reads, `google.refresh.on_open_min_age_seconds`, is
 * NOT declared here: it is one posture for every Google record, so its address
 * and its parser live once, in `features/google-workspace/documents/knobs.ts`
 * (`REFRESH_KNOB`, `refreshSecondsFrom`), and this surface imports them. Two
 * readers of one knob is how two surfaces come to disagree about the same
 * setting.
 */
export const AGENDA_DAYS_KNOB = { feature: "google.calendar", key: "agenda_days" } as const;

/**
 * The knob's value as a usable number of days, clamped to what Google allows.
 *
 * 🚨 `Number(null)` IS `0`, AND SO IS `Number("")`. Both are finite, so the
 * obvious `Number.isFinite` guard alone turns "no row exists" into a ONE-DAY
 * agenda — a person's whole week silently gone — for every organization. Only a
 * real number, or a non-empty numeric string, is a value; everything else is the
 * documented default.
 */
export function agendaDays(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value)) return DEFAULT_AGENDA_DAYS;
  return Math.min(MAX_AGENDA_DAYS, Math.max(MIN_AGENDA_DAYS, Math.floor(value)));
}

// ─── Attendees ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rsvpOf(value: unknown): CalendarRsvp | "unknown" {
  return typeof value === "string" &&
    (CALENDAR_RSVPS as readonly string[]).includes(value)
    ? (value as CalendarRsvp)
    : "unknown";
}

/**
 * 🚨 `__kind` IS PART OF THE DATA — READ AND IGNORED, NEVER STRIPPED, NEVER
 * REQUIRED. The server writes `{"__kind": "calendar_event_attendees",
 * "attendees": [...]}` (`aidream/services/google_sync/kinds.py`). This reads the
 * envelope, and ALSO accepts a bare array, because a consumer that chokes on a
 * shape gets fixed to accept-and-ignore rather than fed stripped data
 * (`KINDS_EVERYWHERE_PLAN.md` §4.2a). The marker is never written back out of
 * here: nothing in this module produces a payload.
 */
export function attendeesOf(column: unknown): CalendarAttendee[] {
  const list = Array.isArray(column)
    ? column
    : isRecord(column) && Array.isArray(column.attendees)
      ? column.attendees
      : [];
  const out: CalendarAttendee[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const email = text(raw.email);
    if (!email) continue;
    out.push({
      email: email.toLowerCase(),
      displayName: text(raw.display_name) ?? text(raw.displayName),
      rsvp: rsvpOf(raw.rsvp),
      optional: raw.optional === true,
      organizer: raw.organizer === true,
      isSelf: raw.self === true || raw.is_self === true,
    });
  }
  return out;
}

/** True when the payload declares the kind we expect. Informational, never a gate. */
export function attendeesPayloadIsKinded(column: unknown): boolean {
  return isRecord(column) && column.__kind === CALENDAR_EVENT_ATTENDEES_KIND;
}

/** What a person calls an RSVP. Never Google's camel-case token. */
export function rsvpLabel(rsvp: CalendarRsvp | "unknown"): string {
  switch (rsvp) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Maybe";
    case "needsAction":
      return "No reply yet";
    default:
      return "Google did not say";
  }
}

/**
 * The RSVP dot's classes — semantic-ish tokens that read in light and dark.
 * `unknown` is deliberately the same muted dot as "no reply": a status word we
 * cannot vouch for must never render as a confident green.
 */
export function rsvpDotClass(rsvp: CalendarRsvp | "unknown"): string {
  switch (rsvp) {
    case "accepted":
      return "bg-emerald-500";
    case "declined":
      return "bg-rose-500";
    case "tentative":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground/40";
  }
}

// ─── Time, grouping, the midnight boundary ──────────────────────────────────

/**
 * 🚨 THE DAY IS COMPUTED IN A NAMED ZONE, NEVER IN THE PROCESS'S ZONE.
 *
 * `toISOString()` is UTC, and the host's "local" parts are whatever the machine
 * happens to be set to — a server-rendered agenda and a jest runner are both
 * UTC, so an 8pm event in New York lands on tomorrow and nothing catches it. So
 * every day here is derived through `Intl` in an EXPLICIT IANA zone, and the
 * viewer's own zone is resolved once at the surface and passed down. It is also
 * the only shape that can honour a person choosing a display timezone later.
 */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const DAY_KEY_CACHE = new Map<string, Intl.DateTimeFormat>();

function dayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const hit = DAY_KEY_CACHE.get(timeZone);
  if (hit) return hit;
  // en-CA formats as YYYY-MM-DD, which sorts lexically — that is the whole point.
  const made = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DAY_KEY_CACHE.set(timeZone, made);
  return made;
}

/** The calendar day `value` falls on IN `timeZone`, as a sortable `YYYY-MM-DD`. */
export function dayKeyInZone(value: Date, timeZone: string): string {
  try {
    return dayKeyFormatter(timeZone).format(value);
  } catch {
    // An unknown zone name must not cost the person their agenda; UTC, loudly.
    console.error(
      `[calendar] the timezone '${timeZone}' is not one this browser knows, so the agenda is grouped in UTC. Remedy: the surface passes Intl.DateTimeFormat().resolvedOptions().timeZone.`,
    );
    return dayKeyFormatter("UTC").format(value);
  }
}

/** `n` days after a `YYYY-MM-DD` key, as a key. Pure string/UTC arithmetic. */
export function addDaysToKey(day: string, n: number): string {
  const [year, month, date] = day.split("-").map((part) => Number(part));
  const at = new Date(Date.UTC(year, (month ?? 1) - 1, (date ?? 1) + n));
  return dayKeyFormatter("UTC").format(at);
}

/**
 * The day an event belongs to, in the viewer's zone.
 *
 * 🚨 AN ALL-DAY EVENT IS NOT AN INSTANT. Google sends an all-day event's start
 * as a DATE (`2026-09-25`), which the server stores as midnight UTC — so in
 * every negative-offset zone, reading it as an instant files the event a day
 * EARLY (a Sep 25 holiday shows on Sep 24 in New York). For `all_day` rows the
 * day is read in UTC, which is the date Google actually said.
 */
export function eventLocalDay(event: CalendarEventRow, timeZone: string = "UTC"): string | null {
  if (!event.starts_at) return null;
  const at = new Date(event.starts_at);
  if (Number.isNaN(at.getTime())) return null;
  return dayKeyInZone(at, event.all_day ? "UTC" : timeZone);
}

const WEEKDAY_CACHE = new Map<string, Intl.DateTimeFormat>();

/** The label for one agenda group: Today, Tomorrow, or "Thursday, Sep 25". */
export function agendaGroupLabel(day: string, todayKey: string, tomorrowKey: string): string {
  if (day === todayKey) return "Today";
  if (day === tomorrowKey) return "Tomorrow";
  const [year, month, date] = day.split("-").map((part) => Number(part));
  if (!year || !month || !date) return day;
  let formatter = WEEKDAY_CACHE.get("weekday");
  if (!formatter) {
    // Formatted in UTC against a UTC-built date, so the label can never name a
    // different day than the key it is labelling.
    formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    WEEKDAY_CACHE.set("weekday", formatter);
  }
  return formatter.format(new Date(Date.UTC(year, month - 1, date)));
}

/**
 * The agenda: today, tomorrow, then each later day inside the window, in the
 * VIEWER's timezone. Today and tomorrow are always present — an empty day says
 * "nothing today", which is an answer; a day with nothing on it beyond tomorrow
 * is simply absent, because listing thirty-one empty headings is noise.
 *
 * `days` counts calendar days INCLUDING today, matching the server's window
 * (`days: 7` = today plus six).
 */
export function groupAgenda(
  events: readonly CalendarEventRow[],
  days: number,
  now: Date,
  timeZone: string = "UTC",
): AgendaGroup[] {
  const span = agendaDays(days);
  const todayKey = dayKeyInZone(now, timeZone);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const lastKey = addDaysToKey(todayKey, span - 1);

  const byDay = new Map<string, CalendarEventRow[]>();
  for (const event of events) {
    const day = eventLocalDay(event, timeZone);
    // An event with no start cannot be placed on a day. It is not dropped in
    // silence — `undatedEvents` below is what the panel renders it in.
    if (!day) continue;
    if (day < todayKey || day > lastKey) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(event);
    else byDay.set(day, [event]);
  }

  const keys = new Set<string>([todayKey, ...byDay.keys()]);
  if (span > 1) keys.add(tomorrowKey);

  return [...keys]
    .sort()
    .filter((day) => day <= lastKey)
    .map((day) => ({
      key: day === todayKey ? "today" : day === tomorrowKey ? "tomorrow" : day,
      label: agendaGroupLabel(day, todayKey, tomorrowKey),
      day,
      events: (byDay.get(day) ?? []).sort(compareEventsByStart),
    }));
}

/** Events the window covers that carry no start time at all. Shown, never dropped. */
export function undatedEvents(events: readonly CalendarEventRow[]): CalendarEventRow[] {
  return events.filter((event) => event.starts_at === null || Number.isNaN(Date.parse(event.starts_at)));
}

function compareEventsByStart(a: CalendarEventRow, b: CalendarEventRow): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  const left = a.starts_at ? Date.parse(a.starts_at) : 0;
  const right = b.starts_at ? Date.parse(b.starts_at) : 0;
  if (left !== right) return left - right;
  return a.title.localeCompare(b.title);
}

const TIME_CACHE = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  const hit = TIME_CACHE.get(timeZone);
  if (hit) return hit;
  const made = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  TIME_CACHE.set(timeZone, made);
  return made;
}

/** "9:00 AM – 9:30 AM", "All day", or an honest sentence when Google said nothing. */
export function eventTimeText(event: CalendarEventRow, timeZone: string = "UTC"): string {
  if (event.all_day) return "All day";
  if (!event.starts_at) return "Google did not give this event a time";
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return "Google did not give this event a time";
  const format = timeFormatter(timeZone);
  const startText = format.format(start);
  if (!event.ends_at) return startText;
  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) return startText;
  return `${startText} – ${format.format(end)}`;
}

// ─── Freshness ──────────────────────────────────────────────────────────────

/** Seconds since the last refresh, or `null` when it has never been refreshed. */
export function secondsSinceRefresh(syncedAt: string | null, now: Date): number | null {
  if (!syncedAt) return null;
  const then = Date.parse(syncedAt);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 1000));
}

/**
 * Whether opening this agenda should spend a Google call. Never refreshed = stale
 * by definition: that is the first open, and there is nothing to show until it
 * happens.
 */
export function isStaleForOpen(
  syncedAt: string | null,
  minAgeSeconds: number,
  now: Date,
): boolean {
  const age = secondsSinceRefresh(syncedAt, now);
  if (age === null) return true;
  return age >= minAgeSeconds;
}

/**
 * Whether OPENING THE AGENDA should spend a Google call, given the rows it
 * already holds.
 *
 * 🚨 A DETACHED ROW IS NEVER EVIDENCE THE WINDOW IS STALE. It is a terminal
 * choice, frozen at whatever `synced_at` it carried the day someone pressed
 * "Keep as AI Matrx data" — `refresh_calendar` reports it `detached_left_alone`
 * and never touches it again, so its age can never become fresh no matter how
 * many times the window refreshes. Counting it would make a window whose only
 * event is detached look permanently stale and spend a call on every open for a
 * fact no call can change; excluding it and finding NOTHING left to judge is
 * therefore read as "nothing here needs a call", not as "never refreshed" —
 * the opposite of what an empty pool means for `isStaleForOpen` itself, which is
 * why this is its own function rather than a filter at the call site.
 */
export function agendaIsStaleForOpen(
  events: readonly CalendarEventRow[],
  minAgeSeconds: number,
  now: Date,
): boolean {
  const refreshable = events.filter((event) => syncStatusOf(event) !== "detached");
  if (events.length > 0 && refreshable.length === 0) return false;
  return isStaleForOpen(newestSyncedAt(refreshable), minAgeSeconds, now);
}

/** The newest `synced_at` across the rows on screen, or null when there are none. */
export function newestSyncedAt(events: readonly CalendarEventRow[]): string | null {
  let best: { iso: string; at: number } | null = null;
  for (const event of events) {
    if (!event.synced_at) continue;
    const at = Date.parse(event.synced_at);
    if (!Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { iso: event.synced_at, at };
  }
  return best?.iso ?? null;
}

/** "Refreshed 4 minutes ago from Google" — PLAN §4.6's own words. */
export function refreshedPhrase(syncedAt: string | null, now: Date): string {
  const seconds = secondsSinceRefresh(syncedAt, now);
  if (seconds === null) return "Never refreshed from Google";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "Refreshed less than a minute ago from Google";
  if (minutes === 1) return "Refreshed 1 minute ago from Google";
  if (minutes < 60) return `Refreshed ${minutes} minutes ago from Google`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? "Refreshed 1 hour ago from Google"
      : `Refreshed ${hours} hours ago from Google`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "Refreshed 1 day ago from Google" : `Refreshed ${days} days ago from Google`;
}

// ─── Doors ──────────────────────────────────────────────────────────────────

/**
 * "Open in Google Calendar" — the event's VIEW, which is the only destination a
 * mirror we hold read-only can honestly offer.
 *
 * 🚨 N15 (VERIFY-U-W1-U-W2) — THE COMMENT AND THE CODE DISAGREED, AND THE CODE
 * WAS WRONG TWICE. It built `/r/eventedit/<base64>`: Google's EDIT form, for a
 * record whose own "What you cannot change from here" section says every write
 * is impossible — and it used plain base64, not the base64url the comment
 * claimed, so any payload whose encoding contains `+` or `/` produced a URL
 * Google cannot decode (`+` is a space in a query string and `/` ends the path
 * segment). Google's documented view link is `?eid=<base64url of
 * "<eventId> <calendarId>">`, unpadded, and that is what this builds.
 */
export function googleCalendarHref(event: CalendarEventRow): string | null {
  if (!event.external_id) return null;
  // The calendar id is part of the payload whenever it is a real calendar; Google
  // resolves the connected account's own calendar when it is absent.
  const calendar = event.calendar_id && event.calendar_id !== "primary" ? event.calendar_id : "";
  const raw = calendar ? `${event.external_id} ${calendar}` : event.external_id;
  let base64: string;
  try {
    // btoa in the browser; Buffer in node (jest). Either way: no dependency.
    // `btoa` is byte-wise, so the string is encoded to UTF-8 bytes first — an
    // accented calendar name would otherwise throw and cost the door entirely.
    base64 =
      typeof btoa === "function"
        ? btoa(String.fromCharCode(...new TextEncoder().encode(raw)))
        : Buffer.from(raw, "utf8").toString("base64");
  } catch {
    return null;
  }
  const eid = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://calendar.google.com/calendar/u/0/r/event?eid=${eid}`;
}

// ─── Frozen rows: the ONE set of words, list and record alike ────────────────

/**
 * 🚨 N6 (VERIFY-U-W1-U-W2) — A FROZEN EVENT MUST NOT READ AS A FRESH ONE.
 * A detached or unavailable event rendered in the agenda exactly like a live one
 * while the header said "Refreshed less than a minute ago from Google", so the
 * list a person actually looks at was the one surface that hid it. The Detail's
 * notice says it; this is the SAME judgement and the SAME words, computed once
 * here so a list row and a record can never disagree about a row's state.
 *
 * `null` for an `available` row — nothing to say, so nothing is said (law 4:
 * never an empty box, never a badge that means "fine").
 */
export interface FrozenEventNotice {
  /** Two or three words for a list row. */
  label: string;
  /** The row's own reason when it has one, else this state's honest default. */
  sentence: string;
  /** What it stops: the same sentence a record's notice leads with. */
  status: "detached" | "unavailable" | "unknown";
}

export const DETACHED_EVENT_SENTENCE =
  "This event is AI Matrx data now and no longer refreshes from Google Calendar.";
export const UNAVAILABLE_EVENT_SENTENCE =
  "Google Calendar would not give us this event the last time we asked, and did not say why.";

export function frozenEventNotice(event: CalendarEventRow): FrozenEventNotice | null {
  const status = syncStatusOf(event);
  if (status === "available") return null;
  const reason = event.sync_status_reason?.trim() || null;
  if (status === "detached") {
    return {
      label: "Kept as AI Matrx data",
      sentence: reason ?? DETACHED_EVENT_SENTENCE,
      status: "detached",
    };
  }
  if (status === "unavailable") {
    return {
      label: "Not answered by Google",
      sentence: reason ?? UNAVAILABLE_EVENT_SENTENCE,
      status: "unavailable",
    };
  }
  // A word this build does not know is still NOT "available": the row says
  // something about itself that we cannot read, and hiding that is the defect.
  return {
    label: "State we cannot read",
    sentence:
      reason ??
      `Google Calendar stored a state for this event that this app does not recognise ("${String(
        event.sync_status,
      )}"), so it may not be refreshing. Refresh it, or keep it as AI Matrx data.`,
    status: "unknown",
  };
}

// ─── Attendees → People: ONE resolver, one-to-MANY ──────────────────────────

/**
 * 🚨 N3 (VERIFY-U-W1-U-W2) — ONE ADDRESS CAN BE TWO PEOPLE, AND BOTH ARE DOORS.
 *
 * Two surfaces each built `new Map(people.map(p => [p.email, p]))` and computed
 * the leftovers as `people.filter(p => !byEmail.has(p.email))`. A shared inbox, a
 * role address or a duplicated contact — all ordinary — gives two Persons the
 * same address: the Map kept the LAST one, and the complement could not catch the
 * loser because the key was present. One real Person vanished from the screen
 * with no word at all, on both the agenda and the event's own Detail.
 *
 * So the join is resolved ONCE, here, as the one-to-many it actually is. Every
 * Person at an address is returned, in a list, and the caller renders every one
 * of them as a door.
 */
export interface AttendeeMatch {
  attendee: CalendarAttendee;
  /** EVERY Person here at this attendee's address. Usually one; never dropped. */
  people: AttendeePerson[];
}

export interface AttendeePeopleIndex {
  /** One entry per attendee, in the event's own order. */
  matches: AttendeeMatch[];
  /**
   * Persons the server linked whose stored address is no longer on the event.
   * The link is the fact, so they are still doors — listed after the attendees.
   */
  unplaced: AttendeePerson[];
  /** True when at least one attendee address is held by more than one Person. */
  hasSharedAddress: boolean;
}

export function resolveAttendeePeople(
  attendees: readonly CalendarAttendee[],
  people: readonly AttendeePerson[],
): AttendeePeopleIndex {
  // Matched by ADDRESS, which is the fact the service carries — never by name,
  // which two different people can share. Both sides are already normalized the
  // way crm normalizes (`contact_medium.value_key`, lower-cased).
  const byEmail = new Map<string, AttendeePerson[]>();
  for (const person of people) {
    if (!person.email) continue;
    const list = byEmail.get(person.email);
    if (list) list.push(person);
    else byEmail.set(person.email, [person]);
  }
  const placed = new Set<AttendeePerson>();
  const matches: AttendeeMatch[] = [];
  let hasSharedAddress = false;
  for (const attendee of attendees) {
    const matched = byEmail.get(attendee.email) ?? [];
    for (const person of matched) placed.add(person);
    if (matched.length > 1) hasSharedAddress = true;
    matches.push({ attendee, people: matched });
  }
  // The complement is computed from the PERSONS THAT RENDERED, never from the
  // key — that is the bug this function exists to make unrepeatable.
  const unplaced = people.filter((person) => !placed.has(person));
  return { matches, unplaced, hasSharedAddress };
}

/**
 * The one sentence that says an address is shared, so neither surface invents its
 * own wording. Plural only, because one Person at an address needs no sentence.
 */
export function sharedAddressSentence(count: number): string | null {
  if (count < 2) return null;
  return `${count} People here share this address — each one opens separately.`;
}

// ─── The Detail primitive's registration data ───────────────────────────────

/**
 * 🚨 THE HEALTH STRIP READS THE ROW, AND THE ROW MUST NAME ITS PRODUCT.
 * `features/item-presentation/sourceHealth.ts` reads the provider from the
 * table's own `provider` column (already `google` here) and the connection from
 * `synced_via_connection_id` — this table's real column, which the producer now
 * reads directly (lane F-51; it used to look for three names no table carries,
 * and this function renamed the column to satisfy one of them). What is left is
 * the ONE fact the row does not carry: which connector product's grant refreshes
 * it. Additive — every real column is still there for the fields, the doors and
 * the history.
 */
export function calendarEventDetailRow(row: CalendarEventRow): DetailRow {
  return {
    ...row,
    provider_product: CALENDAR_PRODUCT_KEY,
  };
}

/** The row back out of a `DetailRow`, or null when it is not one of ours. */
export function asCalendarEventRow(row: DetailRow | null): CalendarEventRow | null {
  if (!row || typeof row.id !== "string" || typeof row.external_id !== "string") return null;
  return row as unknown as CalendarEventRow;
}

/**
 * 🚨 THE STRIP TELLS THE TRUTH ABOUT **THIS EVENT**, NOT ONLY ABOUT THE
 * ACCOUNT — the same law `documents/itemType.tsx`'s sibling enforces for a
 * Google file, kept as a pure function here (no React, no network) so it is
 * testable without mounting anything: a perfectly healthy Google Calendar
 * connection can still be refusing (or, for a detached event, deliberately no
 * longer touching) this one row.
 *
 * `produced` is whatever the generic connector-grant producer answered (or
 * `null` when it could not run at all). This never invents a `source` the
 * generic producer already named.
 */
export function calendarEventHealthOverride(
  row: CalendarEventRow,
  produced: DetailSourceHealth | null,
): DetailSourceHealth {
  const status = syncStatusOf(row);
  if (status === "detached") {
    // THE TERMINAL STATE IS NOT A FAILURE, AND IT OFFERS NO CONTROL THAT
    // CANNOT WORK. The person kept this event as AI Matrx data: a Refresh
    // would be refused by the server with a 409 and a Reconnect repairs
    // nothing, so neither is offered (law 4) — regardless of what the generic
    // producer supplied.
    return {
      ...(produced ?? { source: "Google Calendar" }),
      source: produced?.source ?? "Google Calendar",
      lastRefreshedAt: row.synced_at,
      grant: "ok",
      grantDetail:
        row.sync_status_reason?.trim() ||
        "Kept as AI Matrx data: this event no longer refreshes from Google Calendar and keeps what it had.",
      onRefresh: null,
      onReconnect: null,
    };
  }
  const unavailable = status !== "available";
  const eventSentence = unavailable
    ? row.sync_status_reason?.trim() ||
      "Google Calendar would not give us this event the last time we asked, and did not say why."
    : null;
  if (!produced) {
    return {
      source: "Google Calendar",
      lastRefreshedAt: row.synced_at,
      grant: unavailable ? "unknown" : "ok",
      grantDetail:
        eventSentence ??
        "This event is kept in step with Google Calendar; we could not check the connection behind it just now.",
    };
  }
  if (!unavailable) return produced;
  return {
    ...produced,
    // `unknown` is the vocabulary's honest word for "the grant is not the
    // problem, this event is" — `revoked` would send the person to reconnect
    // something a reconnect cannot repair.
    grant: produced.grant === "ok" ? "unknown" : produced.grant,
    grantDetail: [eventSentence, produced.grantDetail].filter(Boolean).join(" "),
  };
}

function whenText(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

/**
 * 🚨 A CURATED FIELD LIST, NEVER A COLUMN DUMP. The generic `fieldsFromRow`
 * would print `attendees` as raw jsonb (marker and all), `version`, `metadata`
 * and both audit columns, and would lose the five facts PLAN §4.6 names: when,
 * where, the meeting link as a door, the organizer, and the freshness. The
 * attendees have their own section, because they carry RSVP and Person doors.
 */
export function calendarEventFields(
  row: CalendarEventRow,
  now: Date,
  timeZone: string = "UTC",
): DetailField[] {
  const fields: DetailField[] = [
    { key: "when", label: "When", text: calendarEventWhenText(row, timeZone) },
    {
      key: "location",
      label: "Where",
      text: row.location ?? "No location on the event",
    },
  ];
  if (row.meeting_url) {
    fields.push({ key: "meeting_url", label: "Meeting link", text: row.meeting_url });
  } else {
    fields.push({
      key: "meeting_url",
      label: "Meeting link",
      text: "This event has no meeting link",
    });
  }
  fields.push(
    {
      key: "organizer_email",
      label: "Organizer",
      text: row.organizer_email ?? "Google did not say who organized this",
    },
    {
      key: "external_updated_at",
      label: "Last changed in Google",
      text: whenText(row.external_updated_at),
    },
    { key: "synced_at", label: "Freshness", text: refreshedPhrase(row.synced_at, now) },
  );
  if (row.synced_via_connection_id) {
    // THE DOOR LAW: the account a refresh runs through is a record, so it opens.
    fields.push({
      key: "synced_via_connection_id",
      label: "Refreshed through",
      text: row.synced_via_connection_id,
      ref: { token: "integration_connection", id: row.synced_via_connection_id },
    });
  } else {
    fields.push({
      key: "synced_via_connection_id",
      label: "Refreshed through",
      text: "No Google account has refreshed this yet",
    });
  }
  fields.push(
    { key: "calendar_id", label: "Calendar", text: row.calendar_id, mono: true },
    { key: "external_id", label: "Google event id", text: row.external_id, mono: true },
  );
  return fields;
}

/** The full "when" sentence for the detail: the day plus the time range. */
export function calendarEventWhenText(row: CalendarEventRow, timeZone: string = "UTC"): string {
  const day = eventLocalDay(row, timeZone);
  if (!day) return "Google did not give this event a time";
  const [year, month, date] = day.split("-").map((part) => Number(part));
  const dayText = new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1)));
  return row.all_day ? `${dayText} · All day` : `${dayText} · ${eventTimeText(row, timeZone)}`;
}

/**
 * What this surface CANNOT do, and why — PLAN §4.6 is "owned, read-only", and
 * the grant behind it is `calendar.events.owned` READONLY. Law 4: a screen is
 * absent or honest, never a dead or disabled-looking button. These are rendered
 * as a sentence list, never as controls, so nothing here looks pressable.
 */
export const CALENDAR_UNAVAILABLE_ACTIONS: readonly { action: string; why: string }[] = [
  {
    action: "Change the time",
    why: "Our Google Calendar permission is read-only, so a time change here would never reach your calendar. Change it in Google Calendar and refresh.",
  },
  {
    action: "Rename the event",
    why: "Same read-only permission — the title here is a mirror of Google's.",
  },
  {
    action: "Add or remove an attendee",
    why: "Invitations are a Google Calendar write. Add them in Google Calendar; the next refresh brings them here and matches them to your People.",
  },
  {
    action: "Reply to the invitation",
    why: "Your RSVP belongs to your Google account; we can read it, not set it. Reply in Google Calendar or your email.",
  },
];
