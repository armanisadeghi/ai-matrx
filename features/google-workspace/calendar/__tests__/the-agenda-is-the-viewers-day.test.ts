/**
 * The agenda groups the viewer's OWN days — today, tomorrow, then each later day
 * inside the knob's window — and the midnight boundary is the one every calendar
 * gets wrong.
 *
 * FORCING FUNCTION. Each case below is written against a real row shape:
 * `communication.calendar_event` holds ZERO rows live (checked through the
 * Supabase MCP, 2026-09-18), so the fixtures are the GENERATED row type from
 * `types/database.types.ts` — every column, spelled as the live table spells it
 * (`sync_status`, `synced_at`, `synced_via_connection_id`), with an `attendees`
 * payload byte-shaped like the one `aidream/services/google_sync/kinds.py`
 * writes. A column renamed live fails compilation here, not a screen.
 */

import {
  agendaDays,
  attendeesOf,
  eventLocalDay,
  eventTimeText,
  groupAgenda,
  isStaleForOpen,
  newestSyncedAt,
  refreshedPhrase,
  undatedEvents,
} from "../record";
import { CALENDAR_EVENT_ATTENDEES_KIND, type CalendarEventRow } from "../types";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function event(overrides: Partial<CalendarEventRow> & { id: string }): CalendarEventRow {
  return {
    all_day: false,
    attendees: { __kind: CALENDAR_EVENT_ATTENDEES_KIND, attendees: [] },
    calendar_id: "primary",
    created_at: "2026-09-18T00:00:00Z",
    created_by: "1f2e3d4c-5b6a-4978-8877-665544332211",
    deleted_at: null,
    ends_at: null,
    external_id: `google-${overrides.id}`,
    external_updated_at: null,
    location: null,
    meeting_url: null,
    metadata: {},
    organization_id: ORG,
    organizer_email: null,
    provider: "google",
    starts_at: null,
    sync_status: "available",
    sync_status_reason: null,
    synced_at: "2026-09-18T12:00:00Z",
    synced_via_connection_id: "aa11bb22-cc33-4d44-8e55-ff6677889900",
    title: "Untitled",
    updated_at: "2026-09-18T12:00:00Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
  };
}

/**
 * Every case names its zone explicitly — UTC here, so the arithmetic is obvious
 * and the fixtures read as written. The zones where UTC and local DISAGREE are
 * the sibling suite `midnight-is-the-viewers-midnight.test.ts`, which is where
 * the boundary class actually lives.
 */
const ZONE = "UTC";
const NOW = new Date("2026-09-18T09:00:00Z");
const utcIso = (y: number, m: number, d: number, h: number, min = 0): string =>
  new Date(Date.UTC(y, m - 1, d, h, min, 0)).toISOString();

describe("groupAgenda", () => {
  it("always offers Today and Tomorrow, even with nothing on them", () => {
    const groups = groupAgenda([], 7, NOW, ZONE);
    expect(groups.map((group) => group.key).slice(0, 2)).toEqual(["today", "tomorrow"]);
    expect(groups[0].label).toBe("Today");
    expect(groups[1].label).toBe("Tomorrow");
    expect(groups[0].events).toEqual([]);
  });

  it("offers only Today when the window is one day", () => {
    const groups = groupAgenda([], 1, NOW, ZONE);
    expect(groups.map((group) => group.key)).toEqual(["today"]);
  });

  it("files each event on the viewer's own day and sorts within it", () => {
    const later = event({ id: "b", title: "Later today", starts_at: utcIso(2026, 9, 18, 16) });
    const earlier = event({ id: "a", title: "Stand-up", starts_at: utcIso(2026, 9, 18, 9, 30) });
    const tomorrow = event({ id: "c", title: "Dr Chen", starts_at: utcIso(2026, 9, 19, 11) });
    const groups = groupAgenda([later, earlier, tomorrow], 7, NOW, ZONE);
    const today = groups.find((group) => group.key === "today")!;
    expect(today.events.map((row) => row.title)).toEqual(["Stand-up", "Later today"]);
    expect(groups.find((group) => group.key === "tomorrow")!.events.map((r) => r.title)).toEqual([
      "Dr Chen",
    ]);
  });

  it("names a later day rather than calling it Tomorrow", () => {
    const groups = groupAgenda(
      [event({ id: "d", title: "Board", starts_at: utcIso(2026, 9, 22, 14) })],
      7,
      NOW,
      ZONE,
    );
    const group = groups.find((g) => g.day === "2026-09-22")!;
    expect(group.key).toBe("2026-09-22");
    expect(group.label).not.toBe("Tomorrow");
    expect(group.label).toContain("Sep 22");
  });

  it("drops nothing inside the window and nothing outside it into the wrong group", () => {
    const inside = event({ id: "in", starts_at: utcIso(2026, 9, 24, 10) });
    const outside = event({ id: "out", starts_at: utcIso(2026, 9, 30, 10) });
    const past = event({ id: "past", starts_at: utcIso(2026, 9, 17, 10) });
    const groups = groupAgenda([inside, outside, past], 7, NOW, ZONE);
    const ids = groups.flatMap((group) => group.events.map((row) => row.id));
    expect(ids).toEqual(["in"]);
  });

  it("an all-day event stays on the date Google said, in every timezone", () => {
    // Google sends an all-day start as a DATE; the server stores midnight UTC.
    // Read as an instant, this is Sep 24 in New York — a day early.
    const holiday = event({
      id: "all",
      title: "Clinic closed",
      all_day: true,
      starts_at: "2026-09-25T00:00:00Z",
    });
    expect(eventLocalDay(holiday, ZONE)).toBe("2026-09-25");
    const groups = groupAgenda([holiday], 14, NOW, ZONE);
    expect(groups.find((group) => group.day === "2026-09-25")!.events[0].id).toBe("all");
  });

  it("an all-day event sorts before timed events on the same day", () => {
    const groups = groupAgenda(
      [
        event({ id: "timed", title: "Stand-up", starts_at: utcIso(2026, 9, 18, 9, 30) }),
        event({ id: "allday", title: "Offsite", all_day: true, starts_at: "2026-09-18T00:00:00Z" }),
      ],
      7,
      NOW,
      ZONE,
    );
    expect(groups[0].events.map((row) => row.id)).toEqual(["allday", "timed"]);
  });

  it("an event with no start is never silently dropped", () => {
    const orphan = event({ id: "orphan", title: "No time", starts_at: null });
    expect(groupAgenda([orphan], 7, NOW, ZONE).flatMap((g) => g.events)).toEqual([]);
    expect(undatedEvents([orphan]).map((row) => row.id)).toEqual(["orphan"]);
    expect(eventTimeText(orphan)).toBe("Google did not give this event a time");
  });
});

describe("agendaDays", () => {
  it("honours the knob and clamps to what the server accepts", () => {
    expect(agendaDays(14)).toBe(14);
    expect(agendaDays("14")).toBe(14);
    expect(agendaDays(0)).toBe(1);
    expect(agendaDays(90)).toBe(31);
    expect(agendaDays("not a number")).toBe(7);
    expect(agendaDays(undefined)).toBe(7);
  });

  it("🚨 does NOT read 'no row' as a one-day agenda", () => {
    // `Number(null)` and `Number("")` are both 0 — finite, not negative — so the
    // obvious isFinite guard alone silently collapses a person's week to today.
    expect(agendaDays(null)).toBe(7);
    expect(agendaDays("")).toBe(7);
    expect(agendaDays("   ")).toBe(7);
    expect(agendaDays({})).toBe(7);
  });
});

describe("attendeesOf", () => {
  it("reads the kinded envelope the server writes and never requires the marker", () => {
    const payload = {
      __kind: CALENDAR_EVENT_ATTENDEES_KIND,
      attendees: [
        {
          email: "Dr.Chen@Clinic.com",
          display_name: "Dr Chen",
          rsvp: "accepted",
          optional: false,
          organizer: true,
          self: false,
        },
      ],
    };
    const [attendee] = attendeesOf(payload);
    expect(attendee.email).toBe("dr.chen@clinic.com");
    expect(attendee.displayName).toBe("Dr Chen");
    expect(attendee.rsvp).toBe("accepted");
    expect(attendee.organizer).toBe(true);
    // Accept-and-ignore: a bare array (no marker) reads the same, never throws.
    expect(attendeesOf(payload.attendees)).toHaveLength(1);
  });

  it("never renders an RSVP word it cannot vouch for as accepted", () => {
    const [attendee] = attendeesOf([{ email: "x@y.com", rsvp: "maybe-ish" }]);
    expect(attendee.rsvp).toBe("unknown");
  });

  it("answers an empty list for junk instead of throwing", () => {
    expect(attendeesOf(null)).toEqual([]);
    expect(attendeesOf("nope")).toEqual([]);
    expect(attendeesOf({ attendees: [{ display_name: "no email" }] })).toEqual([]);
  });
});

describe("freshness", () => {
  it("refreshes on open only when the row is older than the knob", () => {
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    const old = new Date(NOW.getTime() - 400_000).toISOString();
    expect(isStaleForOpen(fresh, 300, NOW)).toBe(false);
    expect(isStaleForOpen(old, 300, NOW)).toBe(true);
    // Never refreshed IS stale — the first open is what fills the agenda.
    expect(isStaleForOpen(null, 300, NOW)).toBe(true);
  });

  it("says how old the data is, and says plainly when there is none", () => {
    expect(refreshedPhrase(null, NOW)).toBe("Never refreshed from Google");
    expect(refreshedPhrase(new Date(NOW.getTime() - 4 * 60_000).toISOString(), NOW)).toBe(
      "Refreshed 4 minutes ago from Google",
    );
    expect(refreshedPhrase(new Date(NOW.getTime() - 2 * 3_600_000).toISOString(), NOW)).toBe(
      "Refreshed 2 hours ago from Google",
    );
  });

  it("takes the freshest stamp on screen, not the first row", () => {
    const older = event({ id: "1", synced_at: "2026-09-18T10:00:00Z" });
    const newer = event({ id: "2", synced_at: "2026-09-18T11:30:00Z" });
    expect(newestSyncedAt([older, newer])).toBe("2026-09-18T11:30:00Z");
    expect(newestSyncedAt([event({ id: "3", synced_at: null })])).toBeNull();
  });
});
