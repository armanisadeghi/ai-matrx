import type { CalendarCreateIntent, CalendarCreateRequest, CalendarCreateResult } from "./calendarCreateService";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";
import {
  CALENDAR_CREATE_RECOVERY_KEY,
  calendarCreateIntentMatchesRequest,
  calendarCreateResultMatches,
  calendarEventSourceMatchesRecovery,
  readCalendarCreateRecovery,
  settleCalendarCreateFromSource,
  writeCalendarCreateRecovery,
  type CalendarCreateRecoveryRecord,
  type StorageDoor,
} from "./calendarCreateRecovery";

function memoryStorage(raw: string | null = null): StorageDoor & { raw(): string | null } {
  let value = raw;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
    raw: () => value,
  };
}

const request = {
  organization_id: "organization_aurora_dental",
  connection_id: "connection_calendar_reviewer",
  calendar_id: "cedar-review@group.calendar.google.com",
  event_id: "01j9f6p8m3v7a2d4c5n6q8r0st",
  summary: "Cedar treatment plan review",
  description: "Review the updated treatment plan before the patient visit.",
  starts_at: "2026-10-05T09:00:00-07:00",
  ends_at: "2026-10-05T10:00:00-07:00",
  attendees: [{ email: "reviewer@auroradental.test", display_name: "Cedar Reviewer" }],
  send_updates: "all",
} satisfies CalendarCreateRequest;

const preview = {
  intent_id: "intent_calendar_01",
  expires_at: "2026-10-05T16:05:00Z",
  preview: {
    account_email: "admin@admin.com",
    calendar_id: request.calendar_id,
    calendar_summary: "Cedar Review",
    access_role: "owner",
    event_id: request.event_id,
    summary: request.summary,
    description: request.description,
    starts_at: "2026-10-05T16:00:00Z",
    ends_at: "2026-10-05T17:00:00Z",
    attendees: request.attendees,
    send_updates: "all",
    guest_notification_behavior: "Google will notify the invited guest.",
    undo_notice: "Removing the event later cannot recall a delivered notification.",
  },
} satisfies CalendarCreateIntent;

const source = {
  account_email: preview.preview.account_email,
  calendar_id: request.calendar_id,
  calendar_summary: preview.preview.calendar_summary,
  access_role: "owner",
  selected_event_id: request.event_id,
  target_event_id: request.event_id,
  target_etag: '"cedar-v1"',
  occurrence: "single",
  event_summary: request.summary,
  starts_at: { dateTime: "2026-10-05T16:00:00Z" },
  ends_at: { dateTime: "2026-10-05T17:00:00Z" },
  recurrence: [],
  original_start_time: null,
  organizer_email: preview.preview.account_email,
  organizer_self: true,
  self_response_status: null,
  redacted: false,
  move: { available: true, unavailable_reason: null },
  cancel: { available: true, unavailable_reason: null },
  rsvp: { available: false, unavailable_reason: "RSVP is unavailable on the organizer copy." },
} satisfies CalendarEventSourceResult;

function saved(phase: CalendarCreateRecoveryRecord["phase"] = "reviewed_unattempted"): CalendarCreateRecoveryRecord {
  return {
    version: 1,
    actor_id: "admin-user",
    account_label: "admin@admin.com",
    calendar_summary: "Cedar Review",
    time_zone: "America/Los_Angeles",
    request,
    intent: preview,
    result: null,
    source: null,
    problem: phase === "uncertain" ? "The confirmation outcome is unknown." : null,
    phase,
  };
}

describe("calendar create recovery", () => {
  it("never reveals another actor's recovered event details", () => {
    const storage = memoryStorage(JSON.stringify({ ...saved("uncertain"), actor_id: "different-user" }));
    const restored = readCalendarCreateRecovery(storage, "admin-user");
    expect(restored.record).toBeNull();
    expect(restored.warning).toBe("Calendar recovery for another signed-in person was ignored.");
    expect(JSON.stringify(restored)).not.toContain(request.summary);
    expect(JSON.stringify(restored)).not.toContain(request.attendees[0].email);
  });

  it("turns a reloaded attempting checkpoint into a held uncertain outcome", () => {
    const storage = memoryStorage(JSON.stringify(saved("attempting")));
    const restored = readCalendarCreateRecovery(storage, "admin-user");
    expect(restored.record?.phase).toBe("uncertain");
    expect(JSON.parse(storage.raw() ?? "null").phase).toBe("uncertain");
  });

  it("requires the preview to match identity, guests, content, and event instants", () => {
    expect(calendarCreateIntentMatchesRequest(preview, request, {
      accountLabel: "admin@admin.com",
      calendarSummary: "Cedar Review",
    })).toBe(true);
    expect(calendarCreateIntentMatchesRequest({
      ...preview,
      preview: { ...preview.preview, account_email: "another@account.test" },
    }, request, { accountLabel: "admin@admin.com", calendarSummary: "Cedar Review" })).toBe(false);
    expect(calendarCreateIntentMatchesRequest({
      ...preview,
      preview: { ...preview.preview, attendees: [{ email: "other@auroradental.test" }] },
    }, request, { accountLabel: "admin@admin.com", calendarSummary: "Cedar Review" })).toBe(false);
    expect(calendarCreateIntentMatchesRequest({
      ...preview,
      preview: { ...preview.preview, starts_at: "2026-10-05T16:01:00Z" },
    }, request, { accountLabel: "admin@admin.com", calendarSummary: "Cedar Review" })).toBe(false);
  });

  it("holds a confirmation result when provider identity or reviewed fields change", () => {
    const result = {
      intent_id: preview.intent_id,
      result: {
        ...preview.preview,
        provider_event_id: request.event_id,
        provider_etag: "etag-1",
        reconciled_after_uncertain_insert: false,
      },
    } satisfies CalendarCreateResult;
    expect(calendarCreateResultMatches(saved(), result)).toBe(true);
    expect(calendarCreateResultMatches(saved(), {
      ...result,
      result: { ...result.result, calendar_id: "different-calendar" },
    })).toBe(false);
    expect(calendarCreateResultMatches(saved(), {
      ...result,
      result: { ...result.result, guest_notification_behavior: "Different notification effect" },
    })).toBe(false);
  });

  it("readbacks the durable checkpoint before reporting a write as saved", () => {
    const storage: StorageDoor = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(writeCalendarCreateRecovery(storage, saved("attempting"))).toBe(false);
    expect(storage.getItem(CALENDAR_CREATE_RECOVERY_KEY)).toBeNull();
  });

  it("rejects fake consumed and impossible phase combinations on read and write", () => {
    const fakeConsumed = { ...saved("consumed"), intent: null, result: null };
    const storage = memoryStorage(JSON.stringify(fakeConsumed));
    expect(readCalendarCreateRecovery(storage, "admin-user")).toEqual({
      record: null,
      warning: "An invalid calendar recovery record was ignored.",
    });
    expect(writeCalendarCreateRecovery(memoryStorage(), fakeConsumed)).toBe(false);
    expect(writeCalendarCreateRecovery(memoryStorage(), {
      ...saved("preview_unavailable"),
      intent: preview,
      problem: "Preview failed.",
    })).toBe(false);
  });

  it("requires the returned provider event id to equal the reviewed stable id", () => {
    const result = {
      intent_id: preview.intent_id,
      result: {
        ...preview.preview,
        provider_event_id: "another-provider-event",
        provider_etag: "etag-1",
      },
    } satisfies CalendarCreateResult;
    expect(calendarCreateResultMatches(saved(), result)).toBe(false);
  });

  it("settles only a held create when exact non-redacted source identity and instants match", () => {
    expect(calendarEventSourceMatchesRecovery(saved("uncertain"), source)).toBe(true);
    expect(settleCalendarCreateFromSource(saved("uncertain"), source)).toMatchObject({
      phase: "source_verified",
      result: null,
      source: { target_event_id: request.event_id, target_etag: '"cedar-v1"' },
      problem: null,
    });
    expect(settleCalendarCreateFromSource(saved("reviewed_unattempted"), source)).toBeNull();
  });

  it.each([
    ["account", { ...source, account_email: "another@account.test" }],
    ["calendar", { ...source, calendar_id: "another-calendar" }],
    ["selected id", { ...source, selected_event_id: "another-event" }],
    ["target id", { ...source, target_event_id: "another-event" }],
    ["provider version", { ...source, target_etag: "" }],
    ["blank provider version", { ...source, target_etag: "   " }],
    ["redaction", { ...source, redacted: true }],
    ["title", { ...source, event_summary: "Different appointment" }],
    ["start instant", { ...source, starts_at: { dateTime: "2026-10-05T16:01:00Z" } }],
    ["date-only time", { ...source, starts_at: { date: "2026-10-05" } }],
  ])("refuses source with a mismatched or unusable %s", (_case, candidate) => {
    expect(calendarEventSourceMatchesRecovery(saved("uncertain"), candidate)).toBe(false);
    expect(settleCalendarCreateFromSource(saved("uncertain"), candidate)).toBeNull();
  });

  it("normalizes old valid records without source and round-trips valid source proof", () => {
    const old = saved("uncertain");
    const { source: _source, ...oldValue } = old;
    expect(readCalendarCreateRecovery(memoryStorage(JSON.stringify(oldValue)), "admin-user").record?.source).toBeNull();

    const verified = settleCalendarCreateFromSource(saved("uncertain"), source);
    expect(verified).not.toBeNull();
    const storage = memoryStorage();
    expect(verified && writeCalendarCreateRecovery(storage, verified)).toBe(true);
    expect(readCalendarCreateRecovery(storage, "admin-user").record).toEqual(verified);
  });

  it("rejects forged source-verified storage and cannot report proof without readback", () => {
    const forged = {
      ...saved("uncertain"),
      phase: "source_verified" as const,
      problem: null,
      source: { ...source, target_event_id: "another-event" },
    };
    expect(readCalendarCreateRecovery(memoryStorage(JSON.stringify(forged)), "admin-user").record).toBeNull();
    expect(writeCalendarCreateRecovery(memoryStorage(), forged)).toBe(false);

    const verified = settleCalendarCreateFromSource(saved("uncertain"), source);
    const noReadback: StorageDoor = {
      getItem: () => JSON.stringify(saved("uncertain")),
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(verified && writeCalendarCreateRecovery(noReadback, verified)).toBe(false);
  });
});
