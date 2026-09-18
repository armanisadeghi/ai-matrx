/**
 * 🚨 F-52 — "KEEP AS AI MATRX DATA" AND "ARCHIVE" ARE REAL CALLS FOR A
 * CALENDAR EVENT TOO, THROUGH THE SAME SERVER PAIR B-29 BUILT FOR DOCUMENTS.
 *
 * `CalendarEventAvailabilitySection` imports `detachSyncedRecord` /
 * `archiveSyncedRecord` from `documents/service.ts` directly — there is no
 * second endpoint and no second client function here, only this table's own
 * address (`communication.calendar_event`).
 *
 * These tests are about the three ways a button like that lies to a person:
 * running without saying what it costs, sending the wrong record or the wrong
 * workspace, and claiming it worked when the server refused. Every one of
 * them was run against the code with the behaviour it names removed, and
 * every one of them failed first.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { CalendarEventAvailabilitySection } from "../CalendarEventSections";
import { CALENDAR_EVENT_TABLE } from "../record";
import { EVENT_ID, ORG_ID, calendarEventRow } from "./fixtures";
import type { CalendarEventRow } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
let nextResponse: (path: string) => unknown = () => ({});
let failWith: string | null = null;

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body });
    if (failWith) throw new Error(failWith);
    return { status: 200, json: async () => nextResponse(path) };
  },
}));

jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (id: string | null) => {
    if (!id) throw new Error("no organization");
    return id;
  },
}));

const toasts = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toasts.success(...a),
    error: (...a: unknown[]) => toasts.error(...a),
    info: (...a: unknown[]) => toasts.info(...a),
  },
}));

/** What the confirm dialog was asked, and what it answers. */
const confirmations: Array<{ title?: string; description?: string; confirmLabel?: string }> = [];
let confirmAnswer = true;
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async (options: { title?: string; description?: string; confirmLabel?: string }) => {
    confirmations.push(options);
    return confirmAnswer;
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function mount(event: CalendarEventRow): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CalendarEventAvailabilitySection event={event} />);
  });
}

async function click(selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`no control matched ${selector}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {});
}

beforeEach(() => {
  calls.length = 0;
  confirmations.length = 0;
  confirmAnswer = true;
  failWith = null;
  toasts.success.mockClear();
  toasts.error.mockClear();
  nextResponse = () => ({});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const UNAVAILABLE = calendarEventRow({
  sync_status: "unavailable",
  sync_status_reason: "Google Calendar says this event no longer exists.",
});

test("Keep as AI Matrx data names its consequence in calendar words before it runs", async () => {
  nextResponse = () => ({
    id: EVENT_ID,
    table: CALENDAR_EVENT_TABLE,
    entity_token: "calendar_event",
    organization_id: ORG_ID,
    label: "Consult — Dr Chen",
    sync_status: "detached",
    sync_status_reason: "Kept as AI Matrx data: this event no longer refreshes from Google Calendar.",
    archived: false,
    changed: true,
  });
  await mount(UNAVAILABLE);

  await click("[data-calendar-event-keep]");

  // THE CONSEQUENCE IS NAMED FIRST, and never a generic "Are you sure?".
  expect(confirmations).toHaveLength(1);
  const asked = confirmations[0];
  expect(asked.title).toBe("Keep as AI Matrx data");
  expect(asked.description).not.toMatch(/^Are you sure/i);
  expect(asked.description).toContain("stops refreshing from Google Calendar");
  expect(asked.description).toContain("Nothing changes in your Google Calendar");
  expect(asked.description).toContain("cannot be undone");
  expect(asked.confirmLabel).toBe("Keep as AI Matrx data");

  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe(`/google-sync/records/${CALENDAR_EVENT_TABLE}/${EVENT_ID}/detach`);
  // THE RECORD'S OWN ORGANIZATION, never the active one.
  expect(calls[0].body).toEqual({ organization_id: ORG_ID });
  expect(toasts.success).toHaveBeenCalled();
  expect(toasts.error).not.toHaveBeenCalled();
});

test("the call always carries THIS event's own id and organization — never another record's", async () => {
  const otherEvent = calendarEventRow({
    id: "99999999-1111-2222-3333-444444444444",
    organization_id: "11111111-aaaa-bbbb-cccc-000000000099",
    sync_status: "unavailable",
  });
  nextResponse = () => ({
    id: otherEvent.id,
    table: CALENDAR_EVENT_TABLE,
    entity_token: "calendar_event",
    organization_id: otherEvent.organization_id,
    label: null,
    sync_status: "detached",
    sync_status_reason: null,
    archived: false,
    changed: true,
  });
  await mount(otherEvent);

  await click("[data-calendar-event-keep]");

  expect(calls[0].path).toBe(
    `/google-sync/records/${CALENDAR_EVENT_TABLE}/${otherEvent.id}/detach`,
  );
  expect(calls[0].body).toEqual({ organization_id: otherEvent.organization_id });
  expect(calls[0].path).not.toContain(EVENT_ID);
  expect(calls[0].body.organization_id).not.toBe(ORG_ID);
});

test("Archive names that it is recoverable and that Google Calendar is untouched", async () => {
  nextResponse = () => ({
    id: EVENT_ID,
    table: CALENDAR_EVENT_TABLE,
    entity_token: "calendar_event",
    organization_id: ORG_ID,
    label: "Consult — Dr Chen",
    sync_status: "unavailable",
    sync_status_reason: "Google Calendar says this event no longer exists.",
    archived: true,
    changed: true,
  });
  await mount(UNAVAILABLE);

  await click("[data-calendar-event-archive]");

  const asked = confirmations[0];
  expect(asked.title).toBe("Archive this event");
  expect(asked.description).toContain("recoverable from the archive");
  expect(asked.description).toContain("nothing here is");
  expect(asked.description).toContain("Google Calendar is untouched");
  expect(calls[0].path).toBe(`/google-sync/records/${CALENDAR_EVENT_TABLE}/${EVENT_ID}/archive`);
  expect(calls[0].body).toEqual({ organization_id: ORG_ID });
  expect(container.querySelector("[data-calendar-event-archived]")?.textContent).toContain(
    "recoverable from the archive",
  );
});

test("declining the dialog calls nothing at all", async () => {
  confirmAnswer = false;
  await mount(UNAVAILABLE);

  await click("[data-calendar-event-keep]");
  await click("[data-calendar-event-archive]");

  expect(confirmations).toHaveLength(2);
  expect(calls).toEqual([]);
  expect(toasts.success).not.toHaveBeenCalled();
});

test("a server refusal is shown and nothing on screen pretends it worked", async () => {
  failWith = "Google Calendar refused this request.";
  await mount(UNAVAILABLE);

  await click("[data-calendar-event-keep]");

  expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("Google Calendar refused"));
  expect(toasts.success).not.toHaveBeenCalled();
  expect(container.querySelector("[data-calendar-event-archived]")).toBeNull();
  expect(container.querySelector("[data-calendar-event-unavailable]")).not.toBeNull();
});

test("a detached event's notice offers Archive but no Keep, and needs no confirm to just look at it", async () => {
  const detached = calendarEventRow({
    sync_status: "detached",
    sync_status_reason: "Kept as AI Matrx data: this event no longer refreshes from Google Calendar.",
  });
  await mount(detached);

  const notice = container.querySelector("[data-calendar-event-detached]");
  expect(notice?.textContent).toContain("no longer refreshes from Google Calendar");
  expect(container.querySelector("[data-calendar-event-keep]")).toBeNull();
  expect(container.querySelector("[data-calendar-event-archive]")).not.toBeNull();
  expect(calls).toEqual([]);
});

test("an available event renders no availability notice at all (positive control)", async () => {
  const available = calendarEventRow({ sync_status: "available" });
  await mount(available);

  expect(container.querySelector("[data-calendar-event-detached]")).toBeNull();
  expect(container.querySelector("[data-calendar-event-unavailable]")).toBeNull();
  expect(container.querySelector("[data-calendar-event-record-actions]")).toBeNull();
});
