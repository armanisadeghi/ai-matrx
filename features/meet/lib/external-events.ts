// features/meet/lib/external-events.ts
//
// THE PERSON'S OTHER CALENDAR in the Meetings agenda (Meet wave 4). Google
// Calendar's agenda shows every meeting you have wherever it is hosted; Zoom's
// Meetings page shows your calendar beside your Zoom meetings. Here the synced
// Google / Outlook events (`communication.calendar_event`, the person's own rows)
// sit in Upcoming beside AI Matrx meetings, visibly different, and say honestly
// what the AI note-taker can do for each:
//
//   no link            → "Open in AI Matrx" makes it an AI Matrx meeting (with
//                         the note-taker), prefilled from the event
//   Zoom / Meet / Teams → the note-taker cannot join that call — said in words;
//                         "Move to AI Matrx" offers the same prefilled meeting
//   an AI Matrx link   → it IS one of ours: not listed twice
//
// Pure: parses rows, classifies links, filters, and builds the form prefill.

export type CallProvider =
  "zoom" | "google_meet" | "teams" | "webex" | "ai_matrx" | "other";

export const PROVIDER_LABELS: Record<CallProvider, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  webex: "Webex",
  ai_matrx: "AI Matrx",
  other: "Video call",
};

export interface ExternalAttendee {
  readonly email: string | null;
  readonly name: string | null;
  readonly self: boolean;
  readonly organizer: boolean;
  readonly rsvp: string | null;
}

export interface ExternalEvent {
  /** `communication.calendar_event.id` — the record that opens. */
  readonly id: string;
  readonly externalId: string;
  readonly source: string;
  readonly title: string;
  /** ISO start — `occurrenceStart` so the agenda groups it with meetings. */
  readonly occurrenceStart: string;
  readonly durationMinutes: number;
  readonly location: string | null;
  readonly link: string | null;
  readonly provider: CallProvider | null;
  /** The slug when the link is an AI Matrx meeting link. */
  readonly aiMatrxSlug: string | null;
  readonly timeZone: string | null;
  readonly attendees: readonly ExternalAttendee[];
  readonly selfDeclined: boolean;
}

export const CALENDAR_EVENT_COLUMNS =
  "id,provider,external_id,title,starts_at,ends_at,all_day,location,meeting_url," +
  "attendees,calendar_time_zone,sync_status,deleted_at";

const URL_IN_TEXT = /https?:\/\/[^\s<>"')]+/i;
const MEET_SLUG = /\/meet\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})(?:[/?#]|$)/i;

/** The call link: the event's own meeting URL, else the first URL in its location. */
export function linkOf(
  meetingUrl: string | null,
  location: string | null,
): string | null {
  const direct = meetingUrl?.trim();
  if (direct) return direct;
  const found = location?.match(URL_IN_TEXT)?.[0];
  return found ?? null;
}

export function providerOf(
  url: string | null,
  appOrigin?: string,
): CallProvider | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.endsWith("zoom.us") || host.endsWith("zoom.com")) return "zoom";
  if (host === "meet.google.com") return "google_meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com"))
    return "teams";
  if (host.endsWith("webex.com")) return "webex";
  const ours = appOrigin ? safeHost(appOrigin) : null;
  if ((ours && host === ours) || host.endsWith("aimatrx.com")) {
    if (MEET_SLUG.test(url)) return "ai_matrx";
  }
  return "other";
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function attendeesOf(raw: unknown): ExternalAttendee[] {
  const list =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { attendees?: unknown }).attendees)
      ? (raw as { attendees: unknown[] }).attendees
      : Array.isArray(raw)
        ? raw
        : [];
  return list.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const r = a as Record<string, unknown>;
    return [
      {
        email: typeof r.email === "string" ? r.email : null,
        name: typeof r.display_name === "string" ? r.display_name : null,
        self: r.self === true,
        organizer: r.organizer === true,
        rsvp: typeof r.rsvp === "string" ? r.rsvp : null,
      },
    ];
  });
}

/** One `calendar_event` row → an agenda item, or null (all-day, untimed, not synced). */
export function toExternalEvent(
  row: Record<string, unknown>,
  appOrigin?: string,
): ExternalEvent | null {
  if (row.all_day === true || row.deleted_at) return null;
  if (typeof row.sync_status === "string" && row.sync_status !== "available")
    return null;
  const start = Date.parse(String(row.starts_at));
  const end = Date.parse(String(row.ends_at));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  const location = typeof row.location === "string" ? row.location : null;
  const link = linkOf(
    typeof row.meeting_url === "string" ? row.meeting_url : null,
    location,
  );
  const provider = providerOf(link, appOrigin);
  const attendees = attendeesOf(row.attendees);
  return {
    id: String(row.id),
    externalId: String(row.external_id ?? row.id),
    source: String(row.provider ?? "google"),
    title: String(row.title ?? "").trim() || "(No title)",
    occurrenceStart: new Date(start).toISOString(),
    durationMinutes: Math.max(1, Math.round((end - start) / 60_000)),
    location,
    link,
    provider,
    aiMatrxSlug:
      provider === "ai_matrx" ? (link?.match(MEET_SLUG)?.[1] ?? null) : null,
    timeZone:
      typeof row.calendar_time_zone === "string"
        ? row.calendar_time_zone
        : null,
    attendees,
    selfDeclined: attendees.some((a) => a.self && a.rsvp === "declined"),
  };
}

/**
 * What the agenda shows: not over yet, not declined, not an AI Matrx meeting we
 * already list, one row per calendar event (a mirror can carry the same event
 * twice), matching the search.
 */
export function agendaExternalEvents(
  events: readonly ExternalEvent[],
  options: { now: Date; query: string; listedSlugs: ReadonlySet<string> },
): ExternalEvent[] {
  const q = options.query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: ExternalEvent[] = [];
  for (const e of events) {
    const key = `${e.source}:${e.externalId}:${e.occurrenceStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.selfDeclined) continue;
    if (e.aiMatrxSlug && options.listedSlugs.has(e.aiMatrxSlug)) continue;
    const end = Date.parse(e.occurrenceStart) + e.durationMinutes * 60_000;
    if (end <= options.now.getTime()) continue;
    if (q !== "" && !e.title.toLowerCase().includes(q)) continue;
    out.push(e);
  }
  return out;
}

/** The note-taker's honest sentence for an event's call link. */
export function noteTakerLine(event: ExternalEvent): string | null {
  if (!event.provider || event.provider === "ai_matrx") return null;
  return `${PROVIDER_LABELS[event.provider]} call — the AI note-taker joins AI Matrx meetings only.`;
}

/** Guests for the prefilled AI Matrx meeting: everyone on the event except you. */
export function prefillGuests(
  event: ExternalEvent,
): { email: string; name: string | null }[] {
  const seen = new Set<string>();
  return event.attendees.flatMap((a) => {
    const email = a.email?.trim().toLowerCase();
    if (
      !email ||
      a.self ||
      seen.has(email) ||
      email.endsWith("resource.calendar.google.com")
    )
      return [];
    seen.add(email);
    return [{ email, name: a.name }];
  });
}
