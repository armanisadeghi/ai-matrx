/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { StorageDoor } from "./calendarCreateRecovery";
import {
  CalendarEventChangeReview,
  type CalendarEventChangeReviewProps,
  type CalendarEventChangeTransport,
} from "./CalendarEventChangeReview";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";
import { readCalendarChangeCollection, writeCalendarChangeCollection, type CalendarChangeAttempt } from "./calendarChangeRecovery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage implements StorageDoor {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const calendar = {
  id: "cedar@group.calendar.google.com",
  summary: "Cedar Review",
  primary: false,
  access_role: "owner",
  time_zone: "America/Los_Angeles",
};

const source = {
  account_email: "admin@admin.com",
  calendar_id: calendar.id,
  calendar_summary: calendar.summary,
  access_role: "owner",
  selected_event_id: "cedar-instance",
  target_event_id: "cedar-series",
  target_etag: '"cedar-v1"',
  occurrence: "series",
  event_summary: "Cedar treatment review",
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

const movePreview = {
  account_email: source.account_email,
  calendar_id: source.calendar_id,
  calendar_summary: source.calendar_summary,
  access_role: "owner" as const,
  event_id: source.target_event_id,
  occurrence: source.occurrence,
  event_summary: source.event_summary,
  etag: source.target_etag,
  old_start: source.starts_at,
  old_end: source.ends_at,
  new_start: { dateTime: "2026-10-08T11:00:00-07:00" },
  new_end: { dateTime: "2026-10-08T12:00:00-07:00" },
  attendees: ["guest@example.com"],
  send_updates: "all" as const,
  guest_notification_behavior: "Google will notify all guests.",
  recovery_notice: "A later move requires a fresh version.",
};

function transport(overrides: Partial<CalendarEventChangeTransport> = {}): CalendarEventChangeTransport {
  return {
    readSource: jest.fn(async () => source),
    previewReschedule: jest.fn(async () => movePreview),
    confirmReschedule: jest.fn(async () => ({ ...movePreview, provider_etag: '"cedar-v2"', reconciliation_pending: false })),
    previewCancel: jest.fn(async ({ request }) => ({
      account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
      access_role: "owner" as const, event_id: request.event_id, occurrence: request.occurrence,
      event_summary: source.event_summary!, etag: request.expected_etag, starts_at: source.starts_at!, ends_at: source.ends_at!,
      attendees: ["guest@example.com"], send_updates: request.send_updates,
      guest_notification_behavior: "Google will notify guests.", action_notice: "Cancel this organizer event.",
      recovery_notice: "Cancellation cannot be recreated here.",
    })),
    confirmCancel: jest.fn(async () => { throw new Error("connection closed after send"); }),
    previewRsvp: jest.fn(async ({ request }) => ({
      account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
      access_role: "owner" as const, event_id: request.event_id, occurrence: request.occurrence,
      event_summary: source.event_summary!, organizer_email: source.organizer_email!, etag: request.expected_etag,
      old_response_status: "tentative" as const, new_response_status: request.response_status, send_updates: request.send_updates,
      guest_notification_behavior: "Google may notify the organizer.", action_notice: "Only this response changes.",
      recovery_notice: "A later response requires a fresh version.",
    })),
    confirmRsvp: jest.fn(async ({ request }) => ({
      account_email: source.account_email, calendar_id: source.calendar_id, calendar_summary: source.calendar_summary,
      access_role: "owner" as const, event_id: request.event_id, occurrence: request.occurrence,
      event_summary: source.event_summary!, organizer_email: source.organizer_email!, etag: request.expected_etag,
      old_response_status: "tentative" as const, new_response_status: request.response_status, send_updates: request.send_updates,
      guest_notification_behavior: "Google may notify the organizer.", action_notice: "Only this response changes.",
      recovery_notice: "A later response requires a fresh version.", provider_etag: '"cedar-v2"', already_applied: false,
    })),
    ...overrides,
  };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CalendarEventChangeReview", () => {
  let host: HTMLDivElement;
  let root: Root;
  let storage: MemoryStorage;
  let nextId = 0;

  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    storage = new MemoryStorage();
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}` });
  });

  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const baseProps = (changeTransport: CalendarEventChangeTransport, overrides: Partial<CalendarEventChangeReviewProps> = {}): CalendarEventChangeReviewProps => ({
    actorId: "admin-reviewer", organizationId: "organization-cedar", connectionId: "connection-cedar",
    accountLabel: "admin@admin.com", calendar, transport: changeTransport, storage,
    confirmAction: jest.fn(async () => true), ...overrides,
  });

  async function loadSource(changeTransport: CalendarEventChangeTransport) {
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    const id = host.querySelector<HTMLInputElement>('input[aria-label="Google event ID"]')!;
    act(() => setInput(id, source.selected_event_id));
    const target = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Change target"))!;
    act(() => setSelect(target, "series"));
    await act(async () => button(host, "Read event source").click());
  }

  it("confirms the identical reviewed move request once", async () => {
    const changeTransport = transport();
    await loadSource(changeTransport);
    const start = host.querySelector<HTMLInputElement>('input[aria-label="New start"]')!;
    const end = host.querySelector<HTMLInputElement>('input[aria-label="New end"]')!;
    act(() => { setInput(start, "2026-10-08T11:00:00-07:00"); setInput(end, "2026-10-08T12:00:00-07:00"); });
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => setSelect(notifications, "all"));
    await act(async () => button(host, "Review move").click());

    const reviewed = jest.mocked(changeTransport.previewReschedule).mock.calls[0][0].request;
    await act(async () => button(host, "Confirm move").click());

    expect(changeTransport.confirmReschedule).toHaveBeenCalledTimes(1);
    expect(jest.mocked(changeTransport.confirmReschedule).mock.calls[0][0]).toEqual({
      organizationId: "organization-cedar", request: reviewed,
    });
    expect(jest.mocked(changeTransport.confirmReschedule).mock.calls[0][0].request).toBe(reviewed);
    expect(host.textContent).toContain("Google returned a matching change result");
    expect(host.textContent).toContain("Prepare prior time");
  });

  it("refuses a preview whose target differs from the source", async () => {
    const changeTransport = transport({ previewReschedule: jest.fn(async () => ({ ...movePreview, event_id: "wrong-target" })) });
    await loadSource(changeTransport);
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => setSelect(notifications, "all"));
    await act(async () => button(host, "Review move").click());
    expect(host.textContent).toContain("does not match this source and action");
    expect(changeTransport.confirmReschedule).not.toHaveBeenCalled();
  });

  it("holds an uncertain cancellation and never offers cancellation undo", async () => {
    const changeTransport = transport();
    await loadSource(changeTransport);
    const action = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Action"))!;
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => { setSelect(action, "cancel"); setSelect(notifications, "none"); });
    await act(async () => button(host, "Review cancellation").click());
    await act(async () => button(host, "Confirm cancellation").click());
    expect(host.textContent).toContain("Cancellation cannot be settled from a missing event");
    expect(host.textContent).not.toContain("Prepare prior");
  });

  it("marks a reloaded in-flight confirmation uncertain without replaying it", async () => {
    const action = { kind: "reschedule" as const, request: {
      connection_id: "connection-cedar", calendar_id: calendar.id, event_id: source.target_event_id!,
      occurrence: "series" as const, expected_etag: source.target_etag!, starts_at: "2026-10-08T11:00:00-07:00",
      ends_at: "2026-10-08T12:00:00-07:00", send_updates: "all" as const,
    }, preview: movePreview, result: null };
    const pending: CalendarChangeAttempt = {
      version: 1, attempt_id: "attempt-in-flight", actor_id: "admin-reviewer", organization_id: "organization-cedar",
      connection_id: "connection-cedar", account_label: source.account_email, calendar_id: calendar.id,
      calendar_summary: calendar.summary, selected_event_id: source.selected_event_id,
      target_event_id: source.target_event_id!, occurrence: "series", original_source: source,
      action, phase: "attempting", problem: null, source_proof: null,
    };
    const scope = { actorId: "admin-reviewer", organizationId: "organization-cedar", connectionId: "connection-cedar", calendarId: calendar.id };
    expect(writeCalendarChangeCollection(storage, scope, {
      version: 1, actor_id: scope.actorId, organization_id: scope.organizationId,
      connection_id: scope.connectionId, calendar_id: scope.calendarId, attempts: [pending],
    })).toBe(true);
    const changeTransport = transport();
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    expect(host.textContent).toContain("reloaded after confirmation started");
    expect(changeTransport.confirmReschedule).not.toHaveBeenCalled();
    expect(readCalendarChangeCollection(storage, scope).collection.attempts[0].phase).toBe("uncertain");
  });

  it("reviews and confirms this account's RSVP with a fresh version", async () => {
    const changeTransport = transport();
    await loadSource(changeTransport);
    const action = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Action"))!;
    act(() => setSelect(action, "rsvp"));
    const response = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("My response"))!;
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => { setSelect(response, "accepted"); setSelect(notifications, "none"); });
    await act(async () => button(host, "Review RSVP").click());
    await act(async () => button(host, "Confirm RSVP").click());
    expect(changeTransport.confirmRsvp).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Prepare prior response");
  });

  it("discards a late source response after the account context changes", async () => {
    let resolveSource!: (value: CalendarEventSourceResult) => void;
    const deferred = new Promise<CalendarEventSourceResult>((resolve) => { resolveSource = resolve; });
    const changeTransport = transport({ readSource: jest.fn(() => deferred) });
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    const id = host.querySelector<HTMLInputElement>('input[aria-label="Google event ID"]')!;
    act(() => setInput(id, source.selected_event_id));
    await act(async () => button(host, "Read event source").click());
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport, { accountLabel: "different@admin.com" })} />));
    await act(async () => resolveSource(source));
    expect(host.querySelector("[data-calendar-change-source]")).toBeNull();
  });

  it("retains and displays a returned disagreement through reload and source-only settlement", async () => {
    const requestedSource = {
      ...source,
      target_etag: '"cedar-v2"',
      starts_at: { dateTime: "2026-10-08T11:00:00-07:00" },
      ends_at: { dateTime: "2026-10-08T12:00:00-07:00" },
    };
    const readSource = jest.fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(requestedSource)
      .mockResolvedValueOnce(requestedSource);
    const changeTransport = transport({
      readSource,
      confirmReschedule: jest.fn(async () => ({
        ...movePreview,
        event_id: "wrong-returned-event",
        provider_etag: '"cedar-v2"',
        reconciliation_pending: false,
      })),
    });
    await loadSource(changeTransport);
    const start = host.querySelector<HTMLInputElement>('input[aria-label="New start"]')!;
    const end = host.querySelector<HTMLInputElement>('input[aria-label="New end"]')!;
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => {
      setInput(start, "2026-10-08T11:00:00-07:00");
      setInput(end, "2026-10-08T12:00:00-07:00");
      setSelect(notifications, "all");
    });
    await act(async () => button(host, "Review move").click());
    await act(async () => button(host, "Confirm move").click());
    expect(host.textContent).toContain("Returned result differs");
    expect(Array.from(host.querySelectorAll("label")).find((label) => label.textContent?.includes("Returned event"))
      ?.querySelector("input")?.value).toBe("wrong-returned-event");

    const scope = { actorId: "admin-reviewer", organizationId: "organization-cedar", connectionId: "connection-cedar", calendarId: calendar.id };
    let saved = readCalendarChangeCollection(storage, scope).collection.attempts[0];
    expect(saved.phase).toBe("reconciliation_required");
    expect(saved.action.result?.event_id).toBe("wrong-returned-event");

    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    expect(Array.from(host.querySelectorAll("label")).find((label) => label.textContent?.includes("Returned event"))
      ?.querySelector("input")?.value).toBe("wrong-returned-event");
    await act(async () => button(host, "Check current source").click());
    expect(host.textContent).toContain("Notification delivery remains unverified");
    saved = readCalendarChangeCollection(storage, scope).collection.attempts[0];
    expect(saved.phase).toBe("source_requested");
    expect(saved.action.result?.event_id).toBe("wrong-returned-event");

    await act(async () => button(host, "Prepare prior time").click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Prior values loaded");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("immediately holds a malformed post-confirm result without replaying it", async () => {
    const confirmReschedule = jest.fn(async () => ({ unexpected: "payload" }) as never);
    const changeTransport = transport({ confirmReschedule });
    await loadSource(changeTransport);
    const start = host.querySelector<HTMLInputElement>('input[aria-label="New start"]')!;
    const end = host.querySelector<HTMLInputElement>('input[aria-label="New end"]')!;
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"))!;
    act(() => {
      setInput(start, "2026-10-08T11:00:00-07:00");
      setInput(end, "2026-10-08T12:00:00-07:00");
      setSelect(notifications, "all");
    });
    await act(async () => button(host, "Review move").click());
    await act(async () => button(host, "Confirm move").click());
    expect(host.textContent).toContain("cannot validate");
    expect(host.textContent).toContain("Check current source");
    expect(confirmReschedule).toHaveBeenCalledTimes(1);

    const scope = { actorId: "admin-reviewer", organizationId: "organization-cedar", connectionId: "connection-cedar", calendarId: calendar.id };
    expect(readCalendarChangeCollection(storage, scope).collection.attempts[0].phase).toBe("uncertain");
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    expect(host.textContent).toContain("cannot validate");
    expect(host.textContent).toContain("Check current source");
    expect(confirmReschedule).toHaveBeenCalledTimes(1);
  });
  it.each([
    [undefined, null],
    [{ status: "updated", reason: null, cache_refresh_pending: false }, "Saved copy updated"],
    [{ status: "pending", reason: "refresh_pending", cache_refresh_pending: false }, "Saved copy refresh pending"],
    [{ status: "invalid" }, "Saved copy refresh pending"],
  ])("settles and reloads a Google move without repeating it for saved-copy state", async (localRefresh, message) => {
    // The transport receives JSON from the server; malformed refresh metadata must reach the runtime reader.
    const changeTransport = transport({ confirmReschedule: jest.fn(async () => JSON.parse(JSON.stringify({ ...movePreview, provider_etag: '\"cedar-v2\"', reconciliation_pending: false, local_refresh: localRefresh }))) });
    await loadSource(changeTransport);
    const start = host.querySelector<HTMLInputElement>('input[aria-label="New start"]');
    const end = host.querySelector<HTMLInputElement>('input[aria-label="New end"]');
    if (!start || !end) throw new Error('Move fields are missing');
    act(() => { setInput(start, "2026-10-08T11:00:00-07:00"); setInput(end, "2026-10-08T12:00:00-07:00"); });
    const notifications = Array.from(host.querySelectorAll("select")).find((item) => item.parentElement?.textContent?.includes("Guest notifications"));
    if (!notifications) throw new Error("Notification choice is missing");
    act(() => setSelect(notifications, "all"));
    await act(async () => button(host, "Review move").click());
    await act(async () => button(host, "Confirm move").click());
    expect(host.textContent).toContain("Google returned a matching change result");
    expect(host.querySelector('[data-calendar-saved-copy]')?.textContent ?? null).toBe(message);
    expect(changeTransport.confirmReschedule).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<CalendarEventChangeReview {...baseProps(changeTransport)} />));
    expect(host.textContent).toContain("Google returned a matching change result");
    expect(host.querySelector('[data-calendar-saved-copy]')?.textContent ?? null).toBe(message);
    expect(changeTransport.confirmReschedule).toHaveBeenCalledTimes(1);
    expect(Array.from(host.querySelectorAll("button")).some((item) => item.textContent === "Confirm move")).toBe(false);
  });

});
