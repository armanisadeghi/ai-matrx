/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarCreateReview, type CalendarCreateTransport } from "./CalendarCreateReview";
import type { SelectedCalendar } from "./selectedCalendarService";
import type { CalendarCreateIntent, CalendarCreateRequest, CalendarCreateResult } from "./calendarCreateService";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";
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
const source = {
  account_email: intent.preview.account_email,
  calendar_id: request.calendar_id,
  calendar_summary: writerCalendar.summary,
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
  organizer_email: intent.preview.account_email,
  organizer_self: true,
  self_response_status: null,
  redacted: false,
  move: { available: true, unavailable_reason: null },
  cancel: { available: true, unavailable_reason: null },
  rsvp: { available: false, unavailable_reason: "RSVP is unavailable on the organizer copy." },
} satisfies CalendarEventSourceResult;

function createTransport(overrides: Partial<CalendarCreateTransport> = {}): CalendarCreateTransport {
  return {
    preview: jest.fn(async () => intent),
    confirm: jest.fn(async () => result),
    readSource: jest.fn(async () => source),
    ...overrides,
  };
}

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
    source: null,
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
    const transport = createTransport({
      preview: jest.fn(async () => ({ ...intent, preview: { ...intent.preview, summary: "Different event" } })),
    });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Review again");
    expect(transport.preview).toHaveBeenCalledWith(expect.objectContaining({ event_id: request.event_id }));
    expect(host.textContent).toContain("does not match these details");
    expect(host.textContent).toContain("Edit event");
    expect(storage.read().phase).toBe("preview_unavailable");
  });

  it("turns expiry after the dialog into a fresh same-id review instead of confirming", async () => {
    const storage = memoryStorage(recovery());
    const transport = createTransport();
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
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    expect(host.textContent).not.toContain("Retry same confirmation");
    await click(host, "Prepare fresh review");
    expect(transport.confirm).not.toHaveBeenCalled();
    expect(storage.read()).toMatchObject({ phase: "preview_unavailable", request: { event_id: request.event_id } });
    expect(host.textContent).toContain("Review again");
  });

  it("retries only the same unexpired intent after coded unavailability", async () => {
    const storage = memoryStorage(recovery({ phase: "retryable_same_intent" }));
    const transport = createTransport();
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
    const transport = createTransport({ confirm: jest.fn(async () => { throw expiredError; }) });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    await click(host, "Confirm create");
    expect(storage.read()).toMatchObject({ phase: "preview_unavailable", request: { event_id: request.event_id } });
    expect(host.textContent).toContain("Review again");
  });

  it("shows the returned provider id and exact-account event door after success", async () => {
    const storage = memoryStorage(recovery());
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} confirmAction={async () => true} />));
    await click(host, "Confirm create");
    expect(host.textContent).toContain("Event created in Google Calendar");
    expect((host.querySelector('input[value="01j9f6p8m3v7a2d4c5n6q8r0st"]') as HTMLInputElement | null)).not.toBeNull();
    expect(host.querySelector('a[href*="authuser=admin%40admin.com"]')).not.toBeNull();
  });

  it("settles an uncertain create only after an explicit exact-source read and durable save", async () => {
    const storage = memoryStorage(recovery({
      phase: "uncertain",
      problem: "The confirmation outcome is unknown.",
    }));
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));

    expect(transport.readSource).not.toHaveBeenCalled();
    await click(host, "Check original source");

    expect(transport.readSource).toHaveBeenCalledWith({
      organizationId: request.organization_id,
      request: {
        connection_id: request.connection_id,
        calendar_id: request.calendar_id,
        selected_event_id: request.event_id,
        occurrence: "single",
      },
    });
    expect(storage.read()).toMatchObject({ phase: "source_verified", result: null, source: { target_etag: '"cedar-v1"' } });
    expect(host.textContent).toContain("Matching Google source verified");
    expect(host.textContent).toContain(request.summary);
    expect(host.textContent).toContain("does not verify the create response, guests, body, or notifications");
    expect(host.textContent).not.toContain("Event created in Google Calendar");
    expect(host.textContent).toContain("Create another event");
    expect(host.querySelector('a[href*="authuser=admin%40admin.com"]')).not.toBeNull();
  });

  it("keeps mismatched and failed source reads held without inferring absence or a new id", async () => {
    const storage = memoryStorage(recovery({ phase: "uncertain", problem: "The confirmation outcome is unknown." }));
    const transport = createTransport({
      readSource: jest.fn(async () => ({ ...source, event_summary: "Different appointment" })),
    });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Check original source");
    expect(storage.read()).toMatchObject({ phase: "uncertain", source: null });
    expect(host.textContent).toContain("do not match the reviewed event");
    expect(host.textContent).toContain("Returned source differences");
    expect(host.textContent).toContain("Title");
    expect(host.textContent).toContain("Original: Cedar treatment plan review");
    expect(host.textContent).toContain("Returned: Different appointment");
    expect(host.textContent).not.toContain("Provider version");
    expect(host.textContent).not.toContain("Create another event");
    expect(host.textContent).not.toContain("does not exist");

    const failedTransport = createTransport({ readSource: jest.fn(async () => { throw new Error("Google source is unavailable."); }) });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={failedTransport} />));
    await click(host, "Check original source");
    expect(storage.read()).toMatchObject({ phase: "uncertain", source: null });
    expect(host.textContent).not.toContain("Create another event");
    expect(host.textContent).not.toContain("Returned source differences");
  });

  it("shows returned source identity and timing differences without persisting them as proof", async () => {
    const storage = memoryStorage(recovery({ phase: "uncertain", problem: "The confirmation outcome is unknown." }));
    const transport = createTransport({
      readSource: jest.fn(async () => ({
        ...source,
        account_email: "other-proof@example.test",
        target_event_id: "different-provider-event",
        starts_at: { dateTime: "2026-10-05T16:30:00Z" },
      })),
    });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Check original source");

    expect(host.textContent).toContain("Google account");
    expect(host.textContent).toContain("Returned: other-proof@example.test");
    expect(host.textContent).toContain("Target event ID");
    expect(host.textContent).toContain("Returned: different-provider-event");
    expect(host.textContent).toContain("Start");
    expect(host.textContent).toContain("Returned: 2026-10-05T16:30:00Z");
    expect(storage.read()).toMatchObject({ phase: "uncertain", source: null });
    expect(host.textContent).not.toContain("Create another event");
  });

  it("ignores a source reply after the selected organization changes", async () => {
    let resolveSource: ((value: CalendarEventSourceResult) => void) | null = null;
    const storage = memoryStorage(recovery({ phase: "uncertain", problem: "The confirmation outcome is unknown." }));
    const transport = createTransport({
      readSource: jest.fn(() => new Promise<CalendarEventSourceResult>((resolve) => { resolveSource = resolve; })),
    });
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Check original source");
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId="organization_changed" connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await act(async () => { resolveSource?.(source); });
    expect(storage.read()).toMatchObject({ phase: "uncertain", source: null });
    expect(host.textContent).not.toContain("Matching Google source verified");
  });

  it("reloads source proof without any provider call", async () => {
    const verified = recovery({ phase: "source_verified", problem: null, source });
    const storage = memoryStorage(verified);
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    expect(host.textContent).toContain("Matching Google source verified");
    expect(transport.preview).not.toHaveBeenCalled();
    expect(transport.confirm).not.toHaveBeenCalled();
    expect(transport.readSource).not.toHaveBeenCalled();
  });

  it("does not unlock another create when source proof cannot be read back", async () => {
    let raw = JSON.stringify(recovery({ phase: "uncertain", problem: "The confirmation outcome is unknown." }));
    const storage: StorageDoor = {
      getItem: () => raw,
      setItem: (_key, value) => { if (!value.includes('"phase":"source_verified"')) raw = value; },
      removeItem: () => undefined,
    };
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    await click(host, "Check original source");
    expect(host.textContent).toContain("could not save the proof");
    expect(host.textContent).not.toContain("Create another event");
    expect(JSON.parse(raw).phase).toBe("uncertain");
  });
  it.each([
    [undefined, null],
    [null, null],
    [{ status: "updated", reason: null, cache_refresh_pending: false }, "Saved copy updated"],
    [{ status: "pending", reason: "refresh_pending", cache_refresh_pending: false }, "Saved copy refresh pending"],
    [{ status: "invalid" }, "Saved copy refresh pending"],
  ])("restores confirmed create independently of saved-copy metadata", async (localRefresh, message) => {
    const confirmed = { ...result, result: { ...result.result, local_refresh: localRefresh } };
    const storage = memoryStorage(recovery({ phase: "consumed", result: confirmed }));
    const transport = createTransport();
    await act(async () => root.render(<CalendarCreateReview actorId="admin-user" organizationId={request.organization_id} connectionId={request.connection_id} accountLabel="admin@admin.com" calendar={writerCalendar} storage={storage} transport={transport} />));
    expect(host.textContent).toContain("Event created in Google Calendar.");
    expect(host.querySelector('[data-calendar-saved-copy]')?.textContent ?? null).toBe(message);
    expect(transport.confirm).not.toHaveBeenCalled();
    expect(transport.preview).not.toHaveBeenCalled();
    expect(transport.readSource).not.toHaveBeenCalled();
    expect(storage.read().phase).toBe("consumed");
  });

});
