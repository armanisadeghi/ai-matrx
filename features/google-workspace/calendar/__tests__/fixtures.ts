/**
 * ONE row shape, TYPED BY THE DATABASE, shared by the suites in this file that
 * need a full `CalendarEventRow` rather than the ad-hoc `ROW` object other
 * suites here build inline (same convention as
 * `documents/__tests__/fixtures.ts`) — `CalendarEventRow` IS
 * `Database["communication"]["Tables"]["calendar_event"]["Row"]`, generated
 * from the live table, so a column the server adds, renames or makes
 * non-null fails these files at the type gate.
 */

import type { CalendarEventRow } from "../types";

export const EVENT_ID = "aaaaaaaa-1111-2222-3333-444444444444";
export const ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
export const CONNECTION_ID = "cccccccc-1111-2222-3333-444444444444";
export const USER_ID = "dddddddd-1111-2222-3333-444444444444";

export function calendarEventRow(
  overrides: Partial<CalendarEventRow> = {},
): CalendarEventRow {
  return {
    id: EVENT_ID,
    provider: "google",
    external_id: "google-event-1",
    calendar_id: "primary",
    title: "Consult — Dr Chen",
    starts_at: "2026-09-18T13:00:00Z",
    ends_at: "2026-09-18T13:30:00Z",
    all_day: false,
    location: "Suite 300",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    attendees: { __kind: "calendar_event_attendees", attendees: [] },
    organizer_email: "me@clinic.com",
    external_updated_at: "2026-09-17T09:00:00Z",
    synced_at: "2026-09-18T12:00:00Z",
    synced_via_connection_id: CONNECTION_ID,
    sync_status: "available",
    sync_status_reason: null,
    organization_id: ORG_ID,
    created_by: USER_ID,
    updated_by: null,
    created_at: "2026-09-18T12:00:00Z",
    updated_at: "2026-09-18T12:00:00Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    visibility: "personal",
    ...overrides,
  };
}
