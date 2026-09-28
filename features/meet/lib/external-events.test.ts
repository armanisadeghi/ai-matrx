import {
  agendaExternalEvents,
  noteTakerLine,
  prefillGuests,
  providerOf,
  toExternalEvent,
} from "@/features/meet/lib/external-events";

const NOW = new Date("2026-09-28T15:00:00Z");

function row(extra: Record<string, unknown> = {}) {
  return {
    id: "e1",
    provider: "google",
    external_id: "g-1",
    title: "Pricing review",
    starts_at: "2026-09-28T17:00:00Z",
    ends_at: "2026-09-28T17:30:00Z",
    all_day: false,
    location: null,
    meeting_url: null,
    attendees: {
      __kind: "calendar_event_attendees",
      attendees: [
        { email: "me@us.com", self: true, rsvp: "accepted" },
        {
          email: "Lee@Acme.com",
          display_name: "Lee Park",
          self: false,
          rsvp: "needsAction",
        },
        { email: "room-4@resource.calendar.google.com", self: false },
      ],
    },
    calendar_time_zone: "America/Los_Angeles",
    sync_status: "available",
    deleted_at: null,
    ...extra,
  };
}

describe("external calendar events", () => {
  it("classifies call links honestly", () => {
    expect(providerOf("https://acme.zoom.us/j/123")).toBe("zoom");
    expect(providerOf("https://meet.google.com/abc-defg-hij")).toBe(
      "google_meet",
    );
    expect(providerOf("https://teams.microsoft.com/l/meetup-join/x")).toBe(
      "teams",
    );
    expect(providerOf("https://aimatrx.com/meet/1a2-3b4c-5d6")).toBe(
      "ai_matrx",
    );
    expect(providerOf("https://example.com/room")).toBe("other");
    expect(providerOf(null)).toBeNull();
  });

  it("reads a link from the location when the event has none of its own", () => {
    const event = toExternalEvent(
      row({ location: "Join: https://acme.zoom.us/j/99 (pw 1)" }),
    )!;
    expect(event.link).toBe("https://acme.zoom.us/j/99");
    expect(noteTakerLine(event)).toBe(
      "Zoom call — the AI note-taker joins AI Matrx meetings only.",
    );
    expect(event.durationMinutes).toBe(30);
  });

  it("drops all-day, unsynced and declined events, and our own meetings already listed", () => {
    expect(toExternalEvent(row({ all_day: true }))).toBeNull();
    expect(toExternalEvent(row({ sync_status: "failed" }))).toBeNull();
    const declined = toExternalEvent(
      row({
        attendees: {
          attendees: [{ email: "me@us.com", self: true, rsvp: "declined" }],
        },
      }),
    )!;
    const ours = toExternalEvent(
      row({
        id: "e2",
        external_id: "g-2",
        meeting_url: "https://aimatrx.com/meet/1a2-3b4c-5d6",
      }),
    )!;
    const plain = toExternalEvent(row({ id: "e3", external_id: "g-3" }))!;
    const twin = toExternalEvent(row({ id: "e4", external_id: "g-3" }))!;
    const shown = agendaExternalEvents([declined, ours, plain, twin], {
      now: NOW,
      query: "",
      listedSlugs: new Set(["1a2-3b4c-5d6"]),
    });
    expect(shown.map((e) => e.id)).toEqual(["e3"]);
    expect(
      agendaExternalEvents([plain], {
        now: NOW,
        query: "budget",
        listedSlugs: new Set(),
      }),
    ).toEqual([]);
  });

  it("prefills guests from the event, never you and never a room", () => {
    const event = toExternalEvent(row())!;
    expect(prefillGuests(event)).toEqual([
      { email: "lee@acme.com", name: "Lee Park" },
    ]);
  });
});
