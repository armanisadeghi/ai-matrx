import type { CalendarCreateIntent, CalendarCreateRequest, CalendarCreateResult } from "./calendarCreateService";
import {
  CALENDAR_CREATE_RECOVERY_KEY,
  calendarCreateIntentMatchesRequest,
  calendarCreateResultMatches,
  readCalendarCreateRecovery,
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
        provider_event_id: "google-provider-event-1",
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
});
