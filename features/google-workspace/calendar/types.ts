/**
 * Calendar Planes A + C — the shapes. `communication.calendar_event` is a
 * GENERATED type (`types/database.types.ts`, regenerated from live on
 * 2026-09-17), so nothing here re-declares a column.
 *
 * The one hand-written shape is the server's refresh RESPONSE, named
 * `*Pending`: `types/python-generated/api-types.ts` does not carry the
 * `/google-sync/*` contracts yet because the OpenAPI emitter needs a live DB
 * this container cannot reach (google-native REGISTER, 2026-09-17 ruling).
 * Remedy: `pnpm sync-types`, then delete this and import the generated one.
 */

import type { Database, Json } from "@/types/database.types";

/** One row of `communication.calendar_event`, exactly as the DB declares it. */
export type CalendarEventRow =
  Database["communication"]["Tables"]["calendar_event"]["Row"];

/**
 * Google's own RSVP vocabulary (`attendee.responseStatus`), carried through the
 * server verbatim. `needsAction` is what Google sends for "not answered yet".
 */
export const CALENDAR_RSVPS = [
  "accepted",
  "declined",
  "tentative",
  "needsAction",
] as const;
export type CalendarRsvp = (typeof CALENDAR_RSVPS)[number];

/**
 * One attendee, as the server writes it into the `attendees` jsonb
 * (`aidream/services/google_sync/google_reads.py`): email, display_name, rsvp,
 * optional, organizer, self.
 */
export interface CalendarAttendee {
  email: string;
  displayName: string | null;
  /** `unknown` when Google sent a word this build does not know — never "accepted". */
  rsvp: CalendarRsvp | "unknown";
  optional: boolean;
  organizer: boolean;
  /** True when this attendee is the connected account itself. */
  isSelf: boolean;
}

/** The `__kind` every `attendees` payload declares. Read, never stripped. */
export const CALENDAR_EVENT_ATTENDEES_KIND = "calendar_event_attendees";

/**
 * An attendee matched to a Person here — the `calendar_event → party` edge the
 * server writes at refresh (role `attendee`), joined to what we hold about them.
 */
export interface AttendeePerson {
  partyId: string;
  /**
   * The Person's name as `crm.party` holds it. Null only when the row could not
   * be read — the door still opens, labelled by the address, never by nothing.
   */
  displayName: string | null;
  /**
   * Which address on the event this Person holds, normalized the way crm
   * normalizes it (`crm.contact_medium.value_key`). Null when the Person is
   * linked but none of their stored addresses is on the event any more — the
   * link is still the fact, so the door still shows; it is simply not attached
   * to one of the dots.
   */
  email: string | null;
}

/** One group of the agenda: Today, Tomorrow, or a named later day. */
export interface AgendaGroup {
  /** Stable key for React and for tests (`today`, `tomorrow`, `2026-09-25`). */
  key: string;
  label: string;
  /** The local calendar day this group covers, `YYYY-MM-DD` in the viewer's zone. */
  day: string;
  events: CalendarEventRow[];
}

/**
 * `POST /google-sync/calendar/refresh` — the server's `CalendarRefreshResponse`
 * (`aidream/api/routers/google_sync.py`). Hand-written until `pnpm sync-types`
 * can run; see this file's header.
 */
export interface CalendarRefreshResponsePending {
  windowStart: string;
  windowEnd: string;
  events: CalendarRefreshEventPending[];
  attendeesLinked: number;
  unmatchedAttendeeEmails: string[];
}

/** One event of `CalendarRefreshResponsePending`. */
export interface CalendarRefreshEventPending {
  id: string;
  externalId: string;
  calendarId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  meetingUrl: string | null;
  organizerEmail: string | null;
  attendeeEmails: string[];
  linkedPartyIds: string[];
}

/** The `attendees` column as it arrives: a kinded envelope, or (defensively) bare. */
export type CalendarAttendeesColumn = Json;
