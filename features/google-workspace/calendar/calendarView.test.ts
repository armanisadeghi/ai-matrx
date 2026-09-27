import {
  calendarDays,
  calendarSegments,
  positionTimedSegments,
} from "./calendarView";
import { CALENDAR_EVENT_ATTENDEES_KIND, type CalendarEventRow } from "./types";

function event(overrides: Partial<CalendarEventRow> & { id: string }): CalendarEventRow {
  return {
    all_day: false,
    attendees: { __kind: CALENDAR_EVENT_ATTENDEES_KIND, attendees: [] },
    calendar_id: "primary",
    created_at: "2026-09-18T00:00:00Z",
    created_by: "1f2e3d4c-5b6a-4978-8877-665544332211",
    custom_fields: {},
    deleted_at: null,
    ends_at: null,
    external_id: `google-${overrides.id}`,
    external_updated_at: null,
    id: overrides.id,
    location: null,
    meeting_url: null,
    metadata: {},
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    organizer_email: null,
    provider: "google",
    source_calendar_key: null,
    source_connection_owner_id: null,
    source_connection_owner_type: null,
    source_provider_subject: null,
    starts_at: "2026-09-18T13:00:00Z",
    sync_status: "available",
    sync_status_reason: null,
    synced_at: "2026-09-18T12:00:00Z",
    synced_via_connection_id: null,
    title: "Consult",
    updated_at: "2026-09-18T12:00:00Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
  };
}

describe("calendar Day/Week layout", () => {
  const days = calendarDays("2026-09-18", 7);

  it("shows a multi-day all-day event on each local calendar day, with Google's exclusive end date", () => {
    const segments = calendarSegments(
      [event({ id: "offsite", all_day: true, starts_at: "2026-09-18T00:00:00Z", ends_at: "2026-09-21T00:00:00Z" })],
      days,
      "America/Los_Angeles",
    );

    expect(segments.map((segment) => segment.day)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(segments.every((segment) => segment.allDay)).toBe(true);
  });

  it("keeps overlapping meetings side-by-side instead of hiding either meeting", () => {
    const segments = calendarSegments(
      [
        event({ id: "first", starts_at: "2026-09-18T16:00:00Z", ends_at: "2026-09-18T17:00:00Z" }),
        event({ id: "second", starts_at: "2026-09-18T16:30:00Z", ends_at: "2026-09-18T17:30:00Z" }),
      ],
      days,
      "America/Los_Angeles",
    );
    const positioned = positionTimedSegments(segments);

    expect(positioned).toHaveLength(2);
    expect(new Set(positioned.map((segment) => segment.lane))).toEqual(new Set([0, 1]));
    expect(positioned.every((segment) => segment.lanes === 2)).toBe(true);
  });

  it("renders a meeting ending at local midnight as its full elapsed hour", () => {
    const [segment] = calendarSegments(
      [event({ id: "late", starts_at: "2026-09-18T23:00:00Z", ends_at: "2026-09-19T00:00:00Z" })],
      days,
      "UTC",
    );

    expect(segment).toMatchObject({ day: "2026-09-18", startMinute: 1380, endMinute: 1440 });
  });

  it("keeps a fall-back meeting at its actual elapsed hour instead of collapsing repeated local time", () => {
    const [segment] = calendarSegments(
      [event({ id: "fall-back", starts_at: "2026-11-01T05:30:00Z", ends_at: "2026-11-01T06:30:00Z" })],
      calendarDays("2026-11-01", 1),
      "America/New_York",
    );

    expect(segment.day).toBe("2026-11-01");
    expect(segment.endMinute - segment.startMinute).toBe(60);
  });

  it("places a past local day without consulting a provider", () => {
    const past = calendarDays("2026-09-11", 1);
    const segments = calendarSegments(
      [event({ id: "past", starts_at: "2026-09-11T17:00:00Z", ends_at: "2026-09-11T18:00:00Z" })],
      past,
      "America/Los_Angeles",
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ day: "2026-09-11", startMinute: 600, endMinute: 660 });
  });
});
