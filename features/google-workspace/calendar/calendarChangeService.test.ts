import type { RequestOptions, ResponseMeta } from "@/lib/python-client";
import {
  createCalendarChangeService,
  type CalendarCancelRequest,
  type CalendarRescheduleRequest,
  type CalendarRsvpRequest,
} from "./calendarChangeService";

type RecordedCall = { path: string; body: unknown; options: RequestOptions };

const calls: RecordedCall[] = [];
let nextResponse: unknown;

const transport = async <T, B>(
  path: string,
  body: B,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> => {
  calls.push({ path, body, options });
  return {
    data: nextResponse as T,
    meta: { requestId: "test-request", status: 200, serverRequestId: null },
  };
};

const service = createCalendarChangeService(transport);

const rescheduleRequest: CalendarRescheduleRequest = {
  connection_id: "connection-alex",
  calendar_id: "team-calendar",
  event_id: "event-review",
  occurrence: "instance",
  expected_etag: "etag-before-review",
  starts_at: "2026-10-08T15:00:00Z",
  ends_at: "2026-10-08T16:00:00Z",
  send_updates: "externalOnly",
};

const cancelRequest: CalendarCancelRequest = {
  connection_id: "connection-jordan",
  calendar_id: "personal-calendar",
  event_id: "event-cancel",
  occurrence: "series",
  expected_etag: "etag-cancel-review",
  send_updates: "none",
};

const rsvpRequest: CalendarRsvpRequest = {
  connection_id: "connection-sam",
  calendar_id: "shared-calendar",
  event_id: "event-rsvp",
  occurrence: "single",
  expected_etag: "etag-rsvp-review",
  response_status: "tentative",
  send_updates: "all",
};

beforeEach(() => {
  calls.length = 0;
  nextResponse = undefined;
});

describe("calendar change transport", () => {
  it.each([
    {
      label: "preview reschedule",
      path: "/google-integrations/calendar/reschedule/preview",
      organizationId: "org-reschedule",
      request: rescheduleRequest,
      run: (organizationId: string) => service.previewCalendarReschedule({ organizationId, request: rescheduleRequest }),
    },
    {
      label: "confirm reschedule",
      path: "/google-integrations/calendar/reschedule/confirm",
      organizationId: "org-reschedule-confirm",
      request: rescheduleRequest,
      run: (organizationId: string) => service.confirmCalendarReschedule({ organizationId, request: rescheduleRequest }),
    },
    {
      label: "preview cancel",
      path: "/google-integrations/calendar/cancel/preview",
      organizationId: "org-cancel",
      request: cancelRequest,
      run: (organizationId: string) => service.previewCalendarCancel({ organizationId, request: cancelRequest }),
    },
    {
      label: "confirm cancel",
      path: "/google-integrations/calendar/cancel/confirm",
      organizationId: "org-cancel-confirm",
      request: cancelRequest,
      run: (organizationId: string) => service.confirmCalendarCancel({ organizationId, request: cancelRequest }),
    },
    {
      label: "preview RSVP",
      path: "/google-integrations/calendar/rsvp/preview",
      organizationId: "org-rsvp",
      request: rsvpRequest,
      run: (organizationId: string) => service.previewCalendarRsvp({ organizationId, request: rsvpRequest }),
    },
    {
      label: "confirm RSVP",
      path: "/google-integrations/calendar/rsvp/confirm",
      organizationId: "org-rsvp-confirm",
      request: rsvpRequest,
      run: (organizationId: string) => service.confirmCalendarRsvp({ organizationId, request: rsvpRequest }),
    },
  ])("$label posts the caller's exact request with explicit organization", async ({ path, organizationId, request, run }) => {
    const response = { marker: "transport-response" };
    nextResponse = response;

    const result = await run(organizationId);

    expect(result).toBe(response);
    expect(calls).toEqual([{ path, body: request, options: { organizationId } }]);
    expect(calls[0].body).toBe(request);
    expect(calls[0].body).not.toHaveProperty("organization_id");
  });

  it("preserves a backend error from the transport", async () => {
    const backendError = new Error("backend rejected reviewed request");
    const failingService = createCalendarChangeService(async () => {
      throw backendError;
    });

    await expect(failingService.confirmCalendarReschedule({
      organizationId: "org-error",
      request: rescheduleRequest,
    })).rejects.toBe(backendError);
  });

  it("keeps differing account, version, recurrence, and action fields intact at confirmation", async () => {
    const callerReviewedRequest: CalendarRescheduleRequest = {
      ...rescheduleRequest,
      connection_id: "different-connected-account",
      event_id: "different-event",
      occurrence: "series",
      expected_etag: "fresh-review-etag",
      starts_at: "2026-11-20T18:30:00Z",
      ends_at: "2026-11-20T19:45:00Z",
      send_updates: "all",
    };
    nextResponse = { marker: "confirmed" };

    await service.confirmCalendarReschedule({
      organizationId: "org-reviewed",
      request: callerReviewedRequest,
    });

    expect(calls[0].body).toBe(callerReviewedRequest);
    expect(calls[0]).toEqual({
      path: "/google-integrations/calendar/reschedule/confirm",
      body: callerReviewedRequest,
      options: { organizationId: "org-reviewed" },
    });
  });
});
