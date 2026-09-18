/**
 * Calendar Planes A + C — the doors. Four of them, each the ONE path for what it
 * does:
 *
 *  1. READ the agenda — React → Supabase DIRECTLY (`communication.calendar_event`),
 *     never through the Python server, which is not a DB gateway. The list
 *     declares its own scope (`mine`: `created_by = me`) per THE VIEW LAW; RLS is
 *     the ceiling above that, never the view.
 *  2. REFRESH from Google — the ONE compute call, `POST /google-sync/calendar/refresh`,
 *     through `postGoogleBackend` (the Supabase session's bearer token plus the
 *     fail-closed organization header). Never a hand-rolled `fetch`.
 *  3. JOIN attendees to People — through the ONE association read
 *     (`associationsService`), over the `calendar_event → party` edges the SERVER
 *     writes at refresh (role `attendee`, matched on `crm.contact_medium.value_key`).
 *     This client never re-matches emails: two matchers would disagree.
 *  4. CREATE a note about an event — `createNote` (the ONE note writer), then both
 *     association edges through the ONE chokepoint.
 */

"use client";

import { readAllRows } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";
import { postGoogleBackend } from "@/features/marketing/google/service";
import { associationsService } from "@/features/scopes/service/associationsService";
import { createNote } from "@/features/notes/service/notesService";
import { partyContactPointsQuery } from "@/features/crm/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";

import { CALENDAR_EVENT_TYPE, agendaDays, attendeesOf } from "./record";
import type {
  AttendeePerson,
  CalendarEventRow,
  CalendarRefreshResponsePending,
} from "./types";

/** Every column, because the detail renders the row and the panel shares the read. */
const EVENT_COLUMNS = "*";

/**
 * The bare router prefix — `aidream/api/app.py` mounts `google_sync.router` at
 * `/google-sync`. (`ApiPrefixCompatMiddleware` also accepts `/api/…`; the bare
 * spelling is the one aidream's own rule names.)
 */
const REFRESH_PATH = "/google-sync/calendar/refresh";

/**
 * The agenda's rows: this person's own events whose start falls inside the
 * window, plus any the window covers with no start at all.
 *
 * 🚨 `readAllRows` because the panel treats the window as COMPLETE — it counts
 * them, groups them and says "nothing today". A bare `.select()` caps silently at
 * 1000 rows, and a person with a busy 31-day window would lose the tail without
 * a word.
 */
export async function readAgendaEvents(args: {
  organizationId: string;
  userId: string;
  days: number;
  /** `now` is passed so the caller's clock is the only clock. */
  now: Date;
  signal?: AbortSignal;
}): Promise<CalendarEventRow[]> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const span = agendaDays(args.days);
  // A generous floor and ceiling around the window: the day boundary itself is
  // decided in the VIEWER's zone by `groupAgenda`, so this read must not clip a
  // day early or late. One day of slack on each side costs nothing and is the
  // difference between "tonight" showing and not.
  const from = new Date(args.now.getTime() - 36 * 3_600_000).toISOString();
  const to = new Date(args.now.getTime() + (span + 1) * 24 * 3_600_000).toISOString();

  return readAllRows<CalendarEventRow>(
    ({ from: rangeFrom, to: rangeTo }) => {
      let query = supabase
        .schema("communication")
        .from("calendar_event")
        .select(EVENT_COLUMNS, { count: "exact" })
        // THE VIEW LAW: `mine` is the declared scope. A person's agenda is their
        // own (PLAN §5.6 / R1: these rows are `visibility personal`), and RLS
        // above this would also admit shared ones — which is exactly the
        // "org-wide readability poisons a personal space" the law forbids.
        .eq("created_by", args.userId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(rangeFrom, rangeTo);
      if (args.signal) query = query.abortSignal(args.signal);
      return query.returns<CalendarEventRow[]>();
    },
    { label: "communication.calendar_event agenda window" },
  );
}

/** One event by id — what the Detail primitive's loader reads. */
export async function readCalendarEvent(
  id: string,
  signal: AbortSignal,
): Promise<CalendarEventRow | null> {
  const { data, error } = await supabase
    .schema("communication")
    .from("calendar_event")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CalendarEventRow | null) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Refresh one window of owned events from Google. The organization is SENT, never
 * resolved server-side (`CalendarRefreshRequest` requires it and the router
 * answers 422 `organization_required` without it).
 */
export async function refreshCalendarWindow(args: {
  connectionId: string;
  organizationId: string;
  days: number;
  calendarId?: string;
}): Promise<CalendarRefreshResponsePending> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const response = await postGoogleBackend(
    REFRESH_PATH,
    {
      organization_id: organizationId,
      connection_id: args.connectionId,
      calendar_id: args.calendarId ?? "primary",
      days: agendaDays(args.days),
    },
    "Unable to refresh your calendar from Google.",
    organizationId,
  );
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new Error("The Google refresh answered with something this screen cannot read.");
  }
  return {
    windowStart: stringOrNull(payload.window_start) ?? "",
    windowEnd: stringOrNull(payload.window_end) ?? "",
    attendeesLinked: typeof payload.attendees_linked === "number" ? payload.attendees_linked : 0,
    unmatchedAttendeeEmails: Array.isArray(payload.unmatched_attendee_emails)
      ? payload.unmatched_attendee_emails.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    events: payload.events.filter(isRecord).map((event) => ({
      id: stringOrNull(event.id) ?? "",
      externalId: stringOrNull(event.external_id) ?? "",
      calendarId: stringOrNull(event.calendar_id) ?? "primary",
      title: stringOrNull(event.title) ?? "",
      startsAt: stringOrNull(event.starts_at),
      endsAt: stringOrNull(event.ends_at),
      allDay: event.all_day === true,
      meetingUrl: stringOrNull(event.meeting_url),
      organizerEmail: stringOrNull(event.organizer_email),
      attendeeEmails: Array.isArray(event.attendee_emails)
        ? event.attendee_emails.filter((value): value is string => typeof value === "string")
        : [],
      linkedPartyIds: Array.isArray(event.linked_party_ids)
        ? event.linked_party_ids.filter((value): value is string => typeof value === "string")
        : [],
    })),
  };
}

/** One row of `crm.party` the agenda needs to NAME a matched attendee. */
interface PartyNameRow {
  id: string;
  display_name: string;
}

/**
 * Which attendees of these events are People here, per event.
 *
 * 🚨 THE SERVER DID THE MATCHING, AND IT IS NOT REDONE HERE. `refresh_calendar`
 * resolves each attendee email against `crm.contact_medium.value_key` and writes
 * a `calendar_event → party` edge with role `attendee`
 * (`aidream/services/google_sync/records.py`). A second matcher in the browser
 * would disagree with it the first time someone edits a contact — so this reads
 * the EDGES and only asks `crm.party` for the NAME to show. Which of the
 * attendee addresses matched is deliberately not guessed: the edge is the fact.
 */
export async function readAttendeePeople(
  events: readonly CalendarEventRow[],
): Promise<Map<string, AttendeePerson[]>> {
  const byEvent = new Map<string, AttendeePerson[]>();
  const ids = events.map((event) => event.id).filter(Boolean);
  if (ids.length === 0) return byEvent;

  const edges = await associationsService.listForSources(CALENDAR_EVENT_TYPE, ids, "party");
  if (!edges.ok) {
    // NOTHING FAILS SILENTLY: the caller turns this into a sentence on the panel
    // ("we could not check which attendees are People here"), never into an empty
    // list that reads as "none of them are".
    throw new Error(`Could not read which attendees are People here: ${edges.error.message}`);
  }
  const attendeeEdges = edges.data.edges.filter((edge) => edge.role === "attendee");
  const partyIds = [...new Set(attendeeEdges.map((edge) => edge.targetId))];
  if (partyIds.length === 0) return byEvent;

  const names = new Map<string, string>();
  const { data, error } = await supabase
    .schema("crm")
    .from("party")
    .select("id, display_name")
    .in("id", partyIds)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as PartyNameRow[]) names.set(row.id, row.display_name);

  // WHICH ADDRESS each linked Person holds — read through crm's own two hops, on
  // the SAME normalized column the server matched on (`value_key`). This is not a
  // second matcher: membership is the edge. It only decides which of the event's
  // dots a door belongs beside.
  const emailByParty = new Map<string, string>();
  const { data: points, error: pointsError } = await supabase
    .schema("crm")
    .from("party_contact_point")
    .select("party_id, medium:contact_medium!inner(channel, value_key)")
    .in("party_id", partyIds)
    .is("deleted_at", null)
    .eq("medium.channel", "email");
  if (pointsError) throw new Error(pointsError.message);
  for (const row of (points ?? []) as unknown as PartyEmailRow[]) {
    const key = row.medium?.value_key?.trim().toLowerCase();
    if (!key || emailByParty.has(row.party_id)) continue;
    emailByParty.set(row.party_id, key);
  }

  const emailsOnEvent = new Map<string, Set<string>>();
  for (const event of events) {
    emailsOnEvent.set(
      event.id,
      new Set(attendeesOf(event.attendees).map((attendee) => attendee.email)),
    );
  }

  for (const edge of attendeeEdges) {
    const list = byEvent.get(edge.sourceId) ?? [];
    const email = emailByParty.get(edge.targetId) ?? null;
    const onThisEvent = emailsOnEvent.get(edge.sourceId)?.has(email ?? "") === true;
    list.push({
      partyId: edge.targetId,
      displayName: names.get(edge.targetId) ?? null,
      email: onThisEvent ? email : null,
    });
    byEvent.set(edge.sourceId, list);
  }
  return byEvent;
}

/** One `crm.party_contact_point` row joined to the shared medium (crm's rule 1). */
interface PartyEmailRow {
  party_id: string;
  medium: { channel: string; value_key: string | null } | null;
}

/**
 * This Person's email addresses, normalized the way crm normalizes them
 * (`value_key`) — what "Upcoming with this person" filters an agenda by when the
 * server has not yet linked an event to them (an event refreshed BEFORE the
 * Person existed here carries no edge until the next refresh).
 *
 * REUSED, not rebuilt: `partyContactPointsQuery` is crm's own ONE reader for a
 * Person's contact points, and its rule 1 is that a point is always read joined
 * to its shared `crm.contact_medium` — which is where `value_key` lives.
 */
export async function readPartyEmailKeys(partyId: string): Promise<string[]> {
  const { data, error } = await partyContactPointsQuery(partyId);
  if (error) throw new Error(error.message);
  const keys = new Set<string>();
  for (const row of data ?? []) {
    const medium = row.medium as unknown as
      | { channel?: string | null; value_key?: string | null }
      | null;
    if (!medium || medium.channel !== "email") continue;
    const key = medium.value_key?.trim().toLowerCase();
    if (key) keys.add(key);
  }
  return [...keys];
}

/** What a create-note write actually landed, so the surface can be honest about it. */
export interface NoteAboutEventResult {
  noteId: string;
  /** True when the `about` edge to the event landed. */
  linkedToEvent: boolean;
  /** The People the note was linked to. */
  linkedPartyIds: string[];
  /**
   * Every edge that did NOT land, as sentences. The note itself always exists
   * when this resolves — a failed LINK is never allowed to read as a failed note.
   */
  failures: string[];
}

/**
 * "Create a note" on an event (PLAN §4.6): the note, then the link to the event,
 * then a link to each attendee who is a Person here.
 *
 * 🚨 THE EDGE DIRECTION, AND WHY IT IS THIS WAY. §4.6 writes it as
 * `note → calendar_event` role `about`. The one chokepoint's `add()` types its
 * TARGET against `ASSOCIATION_TARGET_TYPES` — a curated container list in
 * `@ai-matrx/associations` that does not carry `calendar_event` — so the edge is
 * written with the EVENT as the source, which is also the direction the server
 * already uses for this table (`calendar_event → party`, role `attendee`), and
 * which lets one `listForEntity('calendar_event', id)` return both the attendees
 * and the notes. The role, the pair and the meaning are the plan's; only the row's
 * direction differs, and widening that union is a package change (THE
 * SAME-SESSION LAW) this lane does not own. The People edges are
 * `note → party`, which the union does carry.
 */
export async function createNoteAboutEvent(args: {
  event: CalendarEventRow;
  organizationId: string;
  partyIds?: readonly string[];
}): Promise<NoteAboutEventResult> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const note = await createNote({
    label: `Notes — ${args.event.title}`.slice(0, 200),
    content: "",
    organization_id: organizationId,
    // R1 / PLAN §5.6: a note about a personal calendar event is personal too.
    visibility: "personal",
  });

  const failures: string[] = [];
  const aboutEvent = await associationsService.add({
    sourceType: CALENDAR_EVENT_TYPE,
    sourceId: args.event.id,
    targetType: "note",
    targetId: note.id,
    orgId: organizationId,
    role: "about",
  });
  if (!aboutEvent.ok) {
    failures.push(
      `The note was created but could not be linked to "${args.event.title}": ${aboutEvent.error.message}`,
    );
  }

  const linkedPartyIds: string[] = [];
  for (const partyId of args.partyIds ?? []) {
    const aboutPerson = await associationsService.add({
      sourceType: "note",
      sourceId: note.id,
      targetType: "party",
      targetId: partyId,
      orgId: organizationId,
      role: "about",
    });
    if (aboutPerson.ok) linkedPartyIds.push(partyId);
    else {
      failures.push(
        `The note was not linked to one of the people on this event: ${aboutPerson.error.message}`,
      );
    }
  }

  return {
    noteId: note.id,
    linkedToEvent: aboutEvent.ok,
    linkedPartyIds,
    failures,
  };
}
