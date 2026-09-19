/**
 * ONE row shape, TYPED BY THE DATABASE, shared by the suites in this file that
 * need a full `CalendarEventRow` rather than the ad-hoc `ROW` object other
 * suites here build inline (same convention as
 * `documents/__tests__/fixtures.ts`) — `CalendarEventRow` IS
 * `Database["communication"]["Tables"]["calendar_event"]["Row"]`, generated
 * from the live table, so a column the server adds, renames or makes
 * non-null fails these files at the type gate.
 *
 * 🚨 EVERY TIME IN HERE IS RELATIVE TO NOW, AND THAT IS NOT A STYLE CHOICE.
 * This fixture shipped with absolute `2026-09-18T…` times, and the surfaces that
 * read it compare against `new Date()`: the agenda renders TODAY and TOMORROW,
 * and refresh-on-open fires when `synced_at` is older than the knob's floor. So
 * the suites passed on the day they were written and went red the next morning —
 * `every-person-at-an-address-is-a-door` rendered "Nothing on your calendar"
 * because the only event was yesterday, and the sibling documents fixture made
 * the panel spend a real refresh call the assertions never expected. A test that
 * only passes on one calendar day is not a test. Anchor everything to `now` here
 * and a suite that WANTS a stale or distant row overrides it by name, which is
 * the only way a reader can tell staleness was intended.
 * Guard: `__tests__/the-fixtures-are-not-time-bombs.test.ts`.
 */

/** Minutes/hours/days from now, as the ISO string a row column holds. */
function fromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
    // Inside the agenda's own window (today/tomorrow, 7 days) on every day it runs.
    starts_at: fromNow(2 * HOUR),
    ends_at: fromNow(2 * HOUR + 30 * MINUTE),
    all_day: false,
    location: "Suite 300",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    attendees: { __kind: "calendar_event_attendees", attendees: [] },
    organizer_email: "me@clinic.com",
    external_updated_at: fromNow(-DAY),
    // FRESH, so refresh-on-open does NOT fire unless a suite asks for it.
    synced_at: fromNow(-MINUTE),
    synced_via_connection_id: CONNECTION_ID,
    sync_status: "available",
    sync_status_reason: null,
    organization_id: ORG_ID,
    created_by: USER_ID,
    updated_by: null,
    created_at: fromNow(-DAY),
    updated_at: fromNow(-MINUTE),
    deleted_at: null,
    version: 1,
    metadata: {},
    visibility: "personal",
    ...overrides,
  };
}
