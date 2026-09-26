import {
  discoverSelectedCalendars,
  readSelectedCalendarEvents,
} from "./selectedCalendarService";

const postGoogleBackend = jest.fn();

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

const CALENDAR = {
  id: "team-calendar",
  summary: "Team calendar",
  primary: false,
  access_role: "reader",
  time_zone: "America/Los_Angeles",
};

describe("selected calendar provider contract", () => {
  beforeEach(() => postGoogleBackend.mockReset());

  it("discovers only for the explicitly named organization and account", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => [CALENDAR] });

    await expect(
      discoverSelectedCalendars({
        organizationId: "org-1",
        connectionId: "account-1",
      }),
    ).resolves.toEqual([CALENDAR]);

    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-sync/calendar/discover",
      { organization_id: "org-1", connection_id: "account-1" },
      "Unable to discover calendars for this Google account.",
      "org-1",
    );
  });

  it("reads one explicitly selected calendar and preserves busy redaction", async () => {
    postGoogleBackend.mockResolvedValue({
      json: async () => ({
        connection_id: "account-1",
        calendar: CALENDAR,
        window_start: "2026-09-26T00:00:00Z",
        window_end: "2026-10-03T00:00:00Z",
        truncated: false,
        events: [
          {
            id: "event-1",
            title: "This must not render",
            starts_at: "2026-09-26T16:00:00Z",
            ends_at: "2026-09-26T17:00:00Z",
            time_zone: "America/Los_Angeles",
            status: "confirmed",
            organizer_email: "organizer@example.com",
            attendees: [
              { email: "person@example.com", rsvp: "accepted" },
            ],
            meeting_url: "https://meet.google.com/abc-defg-hij",
            updated_at: "2026-09-26T01:00:00Z",
            recurring_event_id: null,
            original_start_time: null,
            detail_visible: false,
          },
        ],
      }),
    });

    const window = await readSelectedCalendarEvents({
      organizationId: "org-1",
      connectionId: "account-1",
      calendarId: "team-calendar",
    });

    expect(window.events[0]).toMatchObject({
      detail_visible: false,
      title: "This must not render",
      attendees: [{ email: "person@example.com", rsvp: "accepted" }],
    });
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-sync/calendar/selected-events",
      {
        organization_id: "org-1",
        connection_id: "account-1",
        calendar_id: "team-calendar",
        days: 7,
      },
      "Unable to read the selected calendar.",
      "org-1",
    );
  });

  it("rejects a malformed provider response instead of pretending discovery succeeded", async () => {
    postGoogleBackend.mockResolvedValue({
      json: async () => [{ ...CALENDAR, primary: "yes" }],
    });

    await expect(
      discoverSelectedCalendars({
        organizationId: "org-1",
        connectionId: "account-1",
      }),
    ).rejects.toThrow("Google returned a calendar this screen cannot read.");
  });
});
