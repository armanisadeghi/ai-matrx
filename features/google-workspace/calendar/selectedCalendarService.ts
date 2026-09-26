/**
 * The internal selected-calendar read is a separate provider contract from the
 * owned agenda. It never saves rows or writes events: it discovers calendars
 * for one explicitly chosen account, then reads one explicitly chosen window.
 */

import type { components } from "@/types/python-generated/api-types";
import { postGoogleBackend } from "@/features/marketing/google/service";

export type SelectedCalendar = components["schemas"]["SelectedCalendar"];
export type SelectedEvent = components["schemas"]["SelectedEvent"];
export type SelectedEventWindow = components["schemas"]["SelectedEventWindow"];

const DISCOVER_PATH = "/google-sync/calendar/discover";
const SELECTED_EVENTS_PATH = "/google-sync/calendar/selected-events";

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return Object.entries(value).reduce<Record<string, unknown>>(
    (record, [key, entry]) => {
      record[key] = entry;
      return record;
    },
    {},
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string")
    throw new Error(`Google returned an invalid ${field}.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || typeof value === "string") return value;
  throw new Error(`Google returned an invalid ${field}.`);
}

function selectedCalendar(value: unknown): SelectedCalendar {
  const record = recordOrNull(value);
  if (!record || typeof record.primary !== "boolean") {
    throw new Error("Google returned a calendar this screen cannot read.");
  }
  return {
    id: requiredString(record.id, "calendar id"),
    summary: requiredString(record.summary, "calendar name"),
    primary: record.primary,
    access_role: requiredString(record.access_role, "calendar access role"),
    time_zone: nullableString(record.time_zone, "calendar time zone"),
  };
}

function attendee(value: unknown): { [key: string]: unknown } {
  const record = recordOrNull(value);
  if (!record) throw new Error("Google returned an invalid event attendee.");
  return record;
}

function originalStartTime(value: unknown): { [key: string]: string } | null {
  if (value === null) return null;
  const record = recordOrNull(value);
  if (!record)
    throw new Error("Google returned an invalid original event time.");
  return Object.entries(record).reduce<{ [key: string]: string }>(
    (result, [key, entry]) => {
      result[key] = requiredString(entry, "original event time");
      return result;
    },
    {},
  );
}

function selectedEvent(value: unknown): SelectedEvent {
  const record = recordOrNull(value);
  if (
    !record ||
    typeof record.detail_visible !== "boolean" ||
    !Array.isArray(record.attendees)
  ) {
    throw new Error("Google returned an event this screen cannot read.");
  }
  return {
    id: nullableString(record.id, "event id"),
    title: requiredString(record.title, "event title"),
    starts_at: nullableString(record.starts_at, "event start"),
    ends_at: nullableString(record.ends_at, "event end"),
    time_zone: nullableString(record.time_zone, "event time zone"),
    status: nullableString(record.status, "event status"),
    organizer_email: nullableString(record.organizer_email, "event organizer"),
    attendees: record.attendees.map(attendee),
    meeting_url: nullableString(record.meeting_url, "meeting link"),
    updated_at: nullableString(record.updated_at, "event update time"),
    recurring_event_id: nullableString(
      record.recurring_event_id,
      "recurring event id",
    ),
    original_start_time: originalStartTime(record.original_start_time),
    detail_visible: record.detail_visible,
  };
}

function selectedEventWindow(value: unknown): SelectedEventWindow {
  const record = recordOrNull(value);
  if (
    !record ||
    !Array.isArray(record.events) ||
    typeof record.truncated !== "boolean"
  ) {
    throw new Error(
      "Google returned a calendar window this screen cannot read.",
    );
  }
  return {
    connection_id: requiredString(record.connection_id, "connection id"),
    calendar: selectedCalendar(record.calendar),
    window_start: requiredString(record.window_start, "window start"),
    window_end: requiredString(record.window_end, "window end"),
    events: record.events.map(selectedEvent),
    truncated: record.truncated,
  };
}

export async function discoverSelectedCalendars(input: {
  organizationId: string;
  connectionId: string;
}): Promise<SelectedCalendar[]> {
  const response = await postGoogleBackend(
    DISCOVER_PATH,
    {
      organization_id: input.organizationId,
      connection_id: input.connectionId,
    },
    "Unable to discover calendars for this Google account.",
    input.organizationId,
  );
  const payload: unknown = await response.json();
  if (!Array.isArray(payload))
    throw new Error("Google returned a calendar list this screen cannot read.");
  return payload.map(selectedCalendar);
}

export async function readSelectedCalendarEvents(input: {
  organizationId: string;
  connectionId: string;
  calendarId: string;
  days?: number;
}): Promise<SelectedEventWindow> {
  const response = await postGoogleBackend(
    SELECTED_EVENTS_PATH,
    {
      organization_id: input.organizationId,
      connection_id: input.connectionId,
      calendar_id: input.calendarId,
      days: input.days ?? 7,
    },
    "Unable to read the selected calendar.",
    input.organizationId,
  );
  return selectedEventWindow(await response.json());
}
