import type { StorageDoor } from "./calendarCreateRecovery";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";
import type { CalendarChangeAction, CalendarChangeAttempt, CalendarChangeCollection, CalendarChangeScope } from "./calendarChangeRecovery";
import {
  appendCalendarChangeAttempt,
  calendarChangeActionMatchesSource,
  calendarChangeResultMatches,
  canAppendCalendarChangeAttempt,
  readCalendarChangeCollection,
  reconcileCalendarChangeSource,
  writeCalendarChangeCollection,
} from "./calendarChangeRecovery";

class MemoryStorage implements StorageDoor {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const scope: CalendarChangeScope = {
  actorId: "admin-reviewer",
  organizationId: "organization-cedar",
  connectionId: "connection-cedar",
  calendarId: "cedar@group.calendar.google.com",
};

const source = {
  account_email: "admin@admin.com",
  calendar_id: scope.calendarId,
  calendar_summary: "Cedar Review",
  access_role: "owner",
  selected_event_id: "instance-cedar",
  target_event_id: "series-cedar",
  target_etag: '"cedar-v1"',
  occurrence: "series",
  event_summary: "Cedar treatment plan review",
  starts_at: { dateTime: "2026-10-08T09:00:00-07:00" },
  ends_at: { dateTime: "2026-10-08T10:00:00-07:00" },
  recurrence: ["RRULE:FREQ=WEEKLY"],
  original_start_time: { dateTime: "2026-10-08T09:00:00-07:00" },
  organizer_email: "admin@admin.com",
  organizer_self: true,
  self_response_status: "tentative",
  redacted: false,
  move: { available: true, unavailable_reason: null },
  cancel: { available: true, unavailable_reason: null },
  rsvp: { available: true, unavailable_reason: null },
} satisfies CalendarEventSourceResult;

const moveAction = {
  kind: "reschedule",
  request: {
    connection_id: scope.connectionId,
    calendar_id: scope.calendarId,
    event_id: source.target_event_id,
    occurrence: source.occurrence,
    expected_etag: source.target_etag,
    starts_at: "2026-10-08T17:00:00Z",
    ends_at: "2026-10-08T18:00:00Z",
    send_updates: "all",
  },
  preview: {
    account_email: source.account_email,
    calendar_id: source.calendar_id,
    calendar_summary: source.calendar_summary,
    access_role: "owner",
    event_id: source.target_event_id,
    occurrence: source.occurrence,
    event_summary: source.event_summary,
    etag: source.target_etag,
    old_start: source.starts_at,
    old_end: source.ends_at,
    new_start: { dateTime: "2026-10-08T10:00:00-07:00" },
    new_end: { dateTime: "2026-10-08T11:00:00-07:00" },
    attendees: ["guest@example.com"],
    send_updates: "all",
    guest_notification_behavior: "Google will notify all guests.",
    recovery_notice: "A later move requires a fresh event version.",
  },
  result: null,
} satisfies CalendarChangeAction;

function attempt(overrides: Partial<CalendarChangeAttempt> = {}): CalendarChangeAttempt {
  return {
    version: 1,
    attempt_id: "attempt-cedar-1",
    actor_id: scope.actorId,
    organization_id: scope.organizationId,
    connection_id: scope.connectionId,
    account_label: source.account_email,
    calendar_id: scope.calendarId,
    calendar_summary: source.calendar_summary,
    selected_event_id: source.selected_event_id,
    target_event_id: source.target_event_id!,
    occurrence: source.occurrence,
    original_source: source,
    action: moveAction,
    phase: "reviewed_unattempted",
    problem: null,
    source_proof: null,
    ...overrides,
  };
}

function collection(attempts: CalendarChangeAttempt[]): CalendarChangeCollection {
  return {
    version: 1,
    actor_id: scope.actorId,
    organization_id: scope.organizationId,
    connection_id: scope.connectionId,
    calendar_id: scope.calendarId,
    attempts,
  };
}

describe("calendar change recovery", () => {
  it("durably preserves different targets and blocks a second held series target", () => {
    const storage = new MemoryStorage();
    const first = attempt();
    const otherSource = { ...source, selected_event_id: "other-event", target_event_id: "other-event", occurrence: "single" as const };
    const otherAction = {
      ...moveAction,
      request: { ...moveAction.request, event_id: "other-event", occurrence: "single" as const },
      preview: { ...moveAction.preview, event_id: "other-event", occurrence: "single" as const },
    };
    const other = attempt({ attempt_id: "attempt-cedar-2", selected_event_id: "other-event", target_event_id: "other-event", occurrence: "single", original_source: otherSource, action: otherAction });
    const withFirst = appendCalendarChangeAttempt(collection([]), first)!;
    const withBoth = appendCalendarChangeAttempt(withFirst, other)!;

    expect(writeCalendarChangeCollection(storage, scope, withBoth)).toBe(true);
    expect(readCalendarChangeCollection(storage, scope).collection.attempts.map((item) => item.attempt_id)).toEqual([
      "attempt-cedar-1", "attempt-cedar-2",
    ]);

    const sameSeriesFromAnotherInstance = attempt({
      attempt_id: "attempt-cedar-3",
      selected_event_id: "another-instance",
      original_source: { ...source, selected_event_id: "another-instance" },
    });
    expect(canAppendCalendarChangeAttempt(withBoth, sameSeriesFromAnotherInstance)).toBe(false);
    expect(appendCalendarChangeAttempt(withBoth, sameSeriesFromAnotherInstance)).toBeNull();

    const sameTargetDifferentOccurrence = attempt({
      attempt_id: "attempt-cedar-4",
      selected_event_id: source.target_event_id,
      occurrence: "single",
      original_source: { ...source, selected_event_id: source.target_event_id, occurrence: "single" },
      action: {
        ...moveAction,
        request: { ...moveAction.request, occurrence: "single" },
        preview: { ...moveAction.preview, occurrence: "single" },
      },
    });
    expect(canAppendCalendarChangeAttempt(withBoth, sameTargetDifferentOccurrence)).toBe(true);
  });

  it("compares aware instants across offsets and rejects naive move times", () => {
    expect(calendarChangeActionMatchesSource(moveAction, source)).toBe(true);
    expect(calendarChangeActionMatchesSource({
      ...moveAction,
      request: { ...moveAction.request, starts_at: "2026-10-08T17:00:00", ends_at: "2026-10-08T18:00:00" },
    }, source)).toBe(false);

    expect(reconcileCalendarChangeSource(attempt({ phase: "uncertain", problem: "unknown" }), {
      ...source,
      target_etag: '"cedar-v2"',
      starts_at: { dateTime: "2026-10-08T13:00:00-04:00" },
      ends_at: { dateTime: "2026-10-08T14:00:00-04:00" },
    })).toBe("requested");
  });

  it("requires identity, a usable version, and a generated access role at storage ingress", () => {
    const storage = new MemoryStorage();
    const malformed = collection([attempt({ original_source: { ...source, access_role: "administrator" as "owner" } })]);
    expect(writeCalendarChangeCollection(storage, scope, malformed)).toBe(false);

    const noVersion = collection([attempt({ original_source: { ...source, target_etag: "" } })]);
    expect(writeCalendarChangeCollection(storage, scope, noVersion)).toBe(false);
  });

  it("keeps mismatched, pending, and unusable RSVP results out of success", () => {
    const rsvpAction = {
      kind: "rsvp",
      request: {
        connection_id: scope.connectionId, calendar_id: scope.calendarId,
        event_id: source.target_event_id!, occurrence: source.occurrence,
        expected_etag: source.target_etag!, response_status: "accepted", send_updates: "none",
      },
      preview: {
        account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
        access_role: "owner", event_id: source.target_event_id!, occurrence: source.occurrence,
        event_summary: source.event_summary!, organizer_email: source.organizer_email!, etag: source.target_etag!,
        old_response_status: "tentative", new_response_status: "accepted", send_updates: "none",
        guest_notification_behavior: "Google may notify the organizer.", action_notice: "Only this response changes.",
        recovery_notice: "A later response needs a fresh version.",
      },
      result: null,
    } satisfies CalendarChangeAction;
    const result = { ...rsvpAction.preview, provider_etag: '"cedar-v2"', already_applied: false };
    expect(calendarChangeResultMatches(rsvpAction, result)).toBe(true);
    expect(calendarChangeResultMatches(rsvpAction, { ...result, provider_etag: "" })).toBe(false);
    expect(calendarChangeResultMatches(rsvpAction, { ...result, already_applied: "yes" })).toBe(false);
    expect(calendarChangeResultMatches(rsvpAction, { ...result, event_id: "wrong-event" })).toBe(false);
  });

  it("durably retains a well-shaped returned disagreement through source proof", () => {
    const mismatchedResult = {
      ...moveAction.preview,
      event_id: "different-returned-event",
      provider_etag: '"cedar-v2"',
      reconciliation_pending: false,
    };
    const disagreed = attempt({
      action: { ...moveAction, result: mismatchedResult },
      phase: "reconciliation_required",
      problem: "Returned result differs from the review.",
    });
    const storage = new MemoryStorage();
    expect(writeCalendarChangeCollection(storage, scope, collection([disagreed]))).toBe(true);
    const restored = readCalendarChangeCollection(storage, scope).collection.attempts[0];
    expect(restored.action.result?.event_id).toBe("different-returned-event");

    const proof = {
      ...source,
      target_etag: '"cedar-v2"',
      starts_at: { dateTime: moveAction.request.starts_at },
      ends_at: { dateTime: moveAction.request.ends_at },
    };
    const settled = { ...restored, source_proof: proof, phase: "source_requested" as const, problem: null };
    expect(writeCalendarChangeCollection(storage, scope, collection([settled]))).toBe(true);
    const reread = readCalendarChangeCollection(storage, scope).collection.attempts[0];
    expect(reread.phase).toBe("source_requested");
    expect(reread.action.result?.event_id).toBe("different-returned-event");
  });

  it("rejects every action carrying fields from a different generated request", () => {
    expect(calendarChangeActionMatchesSource({
      ...moveAction,
      request: { ...moveAction.request, response_status: "accepted" },
    }, source)).toBe(false);
    const cancel = {
      kind: "cancel",
      request: {
        connection_id: scope.connectionId, calendar_id: scope.calendarId, event_id: source.target_event_id,
        occurrence: source.occurrence, expected_etag: source.target_etag, send_updates: "none",
      },
      preview: {
        account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
        access_role: "owner", event_id: source.target_event_id, occurrence: source.occurrence, event_summary: source.event_summary,
        etag: source.target_etag, starts_at: source.starts_at, ends_at: source.ends_at, attendees: [], send_updates: "none",
        guest_notification_behavior: "No updates.", action_notice: "Cancel organizer event.", recovery_notice: "No recreation.",
      }, result: null,
    } satisfies CalendarChangeAction;
    expect(calendarChangeActionMatchesSource({ ...cancel, request: { ...cancel.request, ends_at: "2026-10-08T18:00:00Z" } }, source)).toBe(false);
    const rsvp = {
      kind: "rsvp",
      request: {
        connection_id: scope.connectionId, calendar_id: scope.calendarId, event_id: source.target_event_id,
        occurrence: source.occurrence, expected_etag: source.target_etag, response_status: "accepted", send_updates: "none",
      },
      preview: {
        account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
        access_role: "owner", event_id: source.target_event_id, occurrence: source.occurrence, event_summary: source.event_summary,
        organizer_email: source.organizer_email!, etag: source.target_etag, old_response_status: "tentative",
        new_response_status: "accepted", send_updates: "none", guest_notification_behavior: "No updates.",
        action_notice: "Only this response changes.", recovery_notice: "Fresh version required.",
      }, result: null,
    } satisfies CalendarChangeAction;
    expect(calendarChangeActionMatchesSource({ ...rsvp, request: {
      ...rsvp.request, starts_at: "2026-10-08T17:00:00Z", ends_at: "2026-10-08T18:00:00Z",
    } }, source)).toBe(false);
  });

  it("binds stored account and calendar labels to the original source", () => {
    const storage = new MemoryStorage();
    expect(writeCalendarChangeCollection(storage, scope, collection([attempt({ account_label: "spoofed@example.com" })]))).toBe(false);
    expect(writeCalendarChangeCollection(storage, scope, collection([attempt({ calendar_summary: "Spoofed calendar" })]))).toBe(false);
  });

  it("distinguishes requested, unchanged, and divergent all-day RSVP states", () => {
    const allDaySource = {
      ...source,
      occurrence: "single" as const,
      target_event_id: source.selected_event_id,
      starts_at: { date: "2026-10-08" }, ends_at: { date: "2026-10-09" },
    };
    const rsvpAction = {
      kind: "rsvp",
      request: { connection_id: scope.connectionId, calendar_id: scope.calendarId, event_id: source.selected_event_id,
        occurrence: "single", expected_etag: source.target_etag!, response_status: "accepted", send_updates: "none" },
      preview: { account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
        access_role: "owner", event_id: source.selected_event_id, occurrence: "single", event_summary: source.event_summary!,
        organizer_email: source.organizer_email!, etag: source.target_etag!, old_response_status: "tentative",
        new_response_status: "accepted", send_updates: "none", guest_notification_behavior: "No updates.",
        action_notice: "Only this response changes.", recovery_notice: "Fresh review required." }, result: null,
    } satisfies CalendarChangeAction;
    const held = attempt({ original_source: allDaySource, selected_event_id: source.selected_event_id,
      target_event_id: source.selected_event_id, occurrence: "single", action: rsvpAction, phase: "uncertain", problem: "unknown" });
    expect(reconcileCalendarChangeSource(held, { ...allDaySource, target_etag: '"v2"', self_response_status: "accepted" })).toBe("requested");
    expect(reconcileCalendarChangeSource(held, { ...allDaySource, target_etag: '"v2"', self_response_status: "tentative" })).toBe("unchanged");
    expect(reconcileCalendarChangeSource(held, { ...allDaySource, target_etag: '"v2"', ends_at: { date: "2026-10-10" }, self_response_status: "accepted" })).toBe("divergent");
  });
});
