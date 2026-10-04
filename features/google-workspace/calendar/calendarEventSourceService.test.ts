import { postJson } from "@/lib/python-client";
import {
  readCalendarEventSource,
  type CalendarEventSourceRequest,
  type CalendarEventSourceResult,
} from "./calendarEventSourceService";

jest.mock("@/lib/python-client", () => ({ postJson: jest.fn() }));

const request = {
  connection_id: "connection_calendar_reviewer",
  calendar_id: "cedar-review@group.calendar.google.com",
  selected_event_id: "01j9f6p8m3v7a2d4c5n6q8r0st",
  occurrence: "single",
} satisfies CalendarEventSourceRequest;

const source = {
  account_email: "admin@admin.com",
  calendar_id: request.calendar_id,
  calendar_summary: "Cedar Review",
  access_role: "owner",
  selected_event_id: request.selected_event_id,
  target_event_id: request.selected_event_id,
  target_etag: '"cedar-v1"',
  occurrence: "single",
  event_summary: "Cedar treatment plan review",
  starts_at: { dateTime: "2026-10-05T09:00:00-07:00" },
  ends_at: { dateTime: "2026-10-05T10:00:00-07:00" },
  recurrence: [],
  original_start_time: null,
  organizer_email: "admin@admin.com",
  organizer_self: true,
  self_response_status: null,
  redacted: false,
  move: { available: true, unavailable_reason: null },
  cancel: { available: true, unavailable_reason: null },
  rsvp: { available: false, unavailable_reason: "RSVP is unavailable on the organizer copy." },
} satisfies CalendarEventSourceResult;

describe("readCalendarEventSource", () => {
  it("posts the canonical source request with its explicit organization header", async () => {
    jest.mocked(postJson).mockResolvedValue({
      data: source,
      meta: { requestId: "calendar-source-request", status: 200, serverRequestId: null },
    });

    await expect(readCalendarEventSource({
      organizationId: "organization_aurora_dental",
      request,
    })).resolves.toEqual(source);

    expect(postJson).toHaveBeenCalledWith(
      "/google-integrations/calendar/event/source",
      request,
      { organizationId: "organization_aurora_dental" },
    );
  });
});
