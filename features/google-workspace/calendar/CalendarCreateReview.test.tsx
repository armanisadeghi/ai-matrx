/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarCreateReview } from "./CalendarCreateReview";
import type { SelectedCalendar } from "./selectedCalendarService";
import type { CalendarCreateIntent, CalendarCreateRequest, CalendarCreateResult } from "./calendarCreateService";
import { CALENDAR_CREATE_RECOVERY_KEY, type CalendarCreateRecoveryRecord, type StorageDoor } from "./calendarCreateRecovery";
import { BackendApiError } from "@/lib/api/errors";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const readerCalendar = {
  id: "shared-calendar",
  summary: "Clinic coverage",
  primary: false,
  access_role: "reader",
  time_zone: "America/Los_Angeles",
} satisfies SelectedCalendar;

const writerCalendar = { ...readerCalendar, access_role: "owner" } satisfies SelectedCalendar;
const request = {
  organization_id: "organization-aurora-dental",
  connection_id: "connection-calendar-reviewer",
  calendar_id: writerCalendar.id,
  event_id: "01j9f6p8m3v7a2d4c5n6q8r0st",
  summary: "Cedar treatment plan review",
  description: null,
  starts_at: "2026-10-05T09:00:00-07:00",
  ends_at: "2026-10-05T10:00:00-07:00",
  attendees: [{ email: "reviewer@auroradental.test" }],
  send_updates: "all",
} satisfies CalendarCreateRequest;
const intent = {
  intent_id: "intent-calendar-1",
  expires_at: "2099-10-05T16:05:00Z",
  preview: {
    account_email: "admin@admin.com",
    calendar_id: request.calendar_id,
    calendar_summary: writerCalendar.summary,
    access_role: "owner",
    event_id: request.event_id,
    summary: request.summary,
    description: null,
    starts_at: "2026-10-05T16:00:00Z",
    ends_at: "2026-10-05T17:00:00Z",
    attendees: request.attendees,
    send_updates: "all",
    guest_notification_behavior: "Google will notify the invited guest.",
    undo_notice: "Removing the event cannot recall a delivered notification.",
  },
} satisfies CalendarCreateIntent;
const result = {
  intent_id: intent.intent_id,
  result: {
    ...intent.preview,
    provider_event_id: request.event_id,
    provider_etag: "etag-1",
  },
} satisfies CalendarCreateResult;

function recovery(overrides: Partial<CalendarCreateRecoveryRecord> = {}): CalendarCreateRecoveryRecord {
  return {
    version: 1,
    actor_id: "admin-user",
    account_label: "admin@admin.com",
    calendar_summary: writerCalendar.summary,
    time_zone: "America/Los_Angeles",
    request,
    intent,
    result: null,
    problem: null,
    phase: "reviewed_unattempted",
    ...overrides,
  };
}

function memoryStorage(saved: CalendarCreateRecoveryRecord): StorageDoor & { read(): CalendarCreateRecoveryRecord } {
  let raw = JSON.stringify(saved);
  return {
    getItem: () => raw,
    setItem: (_key, value) => { raw = value; },
    removeItem: () => { raw = ""; },
    read: () => JSON.parse(raw) as CalendarCreateRecoveryRecord,
  };
}

async function click(host: HTMLElement, label: string) {
  const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe("CalendarCreateReview", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => root.unmount());
    host.remove();
  });

  it("keeps reader calendars listed while making create unavailable", () => {
    act(() => root.render(
      <CalendarCreateReview
        actorId="admin-user"
        organizationId="organization-aurora-dental"
        connectionId="connection-calendar-reviewer"
        accountLabel="admin@admin.com"
        calendar={readerCalendar}
        storage={{ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }}
      />,
    ));
    expect(host.textContent).toContain("Clinic coverage");
    expect(host.textContent).toContain("Choose a calendar that allows event changes");
    expect(host.querySelector('input[aria-label="Event title"]')).toBeNull();
  });

  it("keeps the stable event id editable after a mismatched preview", async () => {
    const storage = memoryStorage(recovery({ intent: null, phase: "preview_unavailable", problem: "Preview did not match." }));
    const transport = {
      preview: jest.fn(async () => ({ ...intent, preview: { ...intent.preview, summary: "Different event" } })),
      confirm: jest.fn(async () => result),
    };
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Review again");
    expect(transport.preview).toHaveBeenCalledWith(expect.objectContaining({ event_id: request.event_id }));
    expect(host.textContent).toContain("does not match these details");
    expect(host.textContent).toContain("Edit event");
    expect(storage.read().phase).toBe("preview_unavailable");
  });

  it("turns expiry after the dialog into a fresh same-id review instead of confirming", async () => {
    const storage = memoryStorage(recovery());
    const transport = { preview: jest.fn(async () => intent), confirm: jest.fn(async () => result) };
    const confirmAction = jest.fn(async () => {
      jest.spyOn(Date, "now").mockReturnValue(Date.parse("2100-01-01T00:00:00Z"));
      return true;
    });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={confirmAction} />));
    await click(host, "Confirm create");
    expect(transport.confirm).not.toHaveBeenCalled();
    expect(storage.read()).toMatchObject({ phase: "preview_unavailable", request: { event_id: request.event_id } });
    expect(host.textContent).toContain("expired while confirmation was open");
  });

  it("gives an already-expired same-intent retry an explicit fresh-review action", async () => {
    const expiredIntent = { ...intent, expires_at: "2000-01-01T00:00:00Z" };
    const storage = memoryStorage(recovery({ intent: expiredIntent, phase: "retryable_same_intent" }));
    const transport = { preview: jest.fn(async () => intent), confirm: jest.fn(async () => result) };
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    expect(host.textContent).not.toContain("Retry same confirmation");
    await click(host, "Prepare fresh review");
    expect(transport.confirm).not.toHaveBeenCalled();
    expect(storage.read()).toMatchObject({ phase: "preview_unavailable", request: { event_id: request.event_id } });
    expect(host.textContent).toContain("Review again");
  });

  it("retries only the same unexpired intent after coded unavailability", async () => {
    const storage = memoryStorage(recovery({ phase: "retryable_same_intent" }));
    const transport = { preview: jest.fn(async () => intent), confirm: jest.fn(async () => result) };
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    await click(host, "Retry same confirmation");
    expect(transport.confirm).toHaveBeenCalledWith({ intentId: intent.intent_id, organizationId: request.organization_id });
    expect(transport.preview).not.toHaveBeenCalled();
  });

  it("routes a server-expired confirmation to explicit fresh review", async () => {
    const storage = memoryStorage(recovery());
    const expiredError = new BackendApiError({
      code: "calendar_create_preview_expired",
      detail: "expired",
      userMessage: "This Calendar preview expired.",
      status: 409,
    });
    const transport = { preview: jest.fn(async () => intent), confirm: jest.fn(async () => { throw expiredError; }) };
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    await click(host, "Confirm create");
    expect(storage.read()).toMatchObject({ phase: "preview_unavailable", request: { event_id: request.event_id } });
    expect(host.textContent).toContain("Review again");
  });

  it("shows the returned provider id and exact-account event door after success", async () => {
    const storage = memoryStorage(recovery());
    const transport = { preview: jest.fn(async () => intent), confirm: jest.fn(async () => result) };
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    await click(host, "Confirm create");
    expect(host.textContent).toContain("Event created in Google Calendar");
    expect((host.querySelector('input[value="01j9f6p8m3v7a2d4c5n6q8r0st"]') as HTMLInputElement | null)).not.toBeNull();
    expect(host.querySelector('a[href*="authuser=admin%40admin.com"]')).not.toBeNull();
  });
});
