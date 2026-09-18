/**
 * 🚨 N11 (VERIFY-U-W1-U-W2) — AN UNAVAILABLE EVENT OFFERS EVERY ACTION THAT IS
 * REAL FOR IT, AND SAYS SO ABOUT THE ONE THAT IS NOT.
 *
 * The event's notice offered only "Keep as AI Matrx data" and "Archive" while the
 * Doc sibling offered four. Reconnect is a real door — the grant is what Google
 * refused — and it opens IN PLACE through the same Google connect window the
 * record's own health strip uses, never a trip to a settings page (the Doc's
 * anchors are N9, and are not this lane's file).
 *
 * Re-picking, the Doc's fourth, means NOTHING for a meeting: an event is not a
 * file somebody chose, so there is nothing to choose again. Law 4 says that is
 * stated in one honest line rather than offered as a control that cannot work.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const connectOpens: { reason?: string; initialConnectionId?: string }[] = [];
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => (options?: {
    reason?: string;
    initialConnectionId?: string;
  }) => {
    connectOpens.push(options ?? {});
    return { close: () => {} };
  },
}));

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: async () => ({ status: 200, json: async () => ({}) }),
}));
jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (id: string | null) => {
    if (!id) throw new Error("no organization");
    return id;
  },
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => false,
}));

import { CalendarEventAvailabilitySection } from "../CalendarEventSections";
import { calendarEventRow, CONNECTION_ID } from "./fixtures";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function mount(event: ReturnType<typeof calendarEventRow>): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CalendarEventAvailabilitySection event={event} />);
  });
  await act(async () => {});
}

beforeEach(() => {
  connectOpens.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const UNAVAILABLE = calendarEventRow({
  sync_status: "unavailable",
  sync_status_reason: "Google Calendar says this event no longer exists.",
});

test("all four of the Doc sibling's actions are answered — three real, one refused in words", async () => {
  await mount(UNAVAILABLE);

  // 1 + 2: the two real server calls (B-29's generic pair) are still here.
  expect(container.querySelector("[data-calendar-event-keep]")).not.toBeNull();
  expect(container.querySelector("[data-calendar-event-archive]")).not.toBeNull();
  // 3: Reconnect, a real door, and a CONTROL rather than a link away.
  const reconnect = container.querySelector<HTMLButtonElement>(
    "[data-calendar-event-reconnect]",
  );
  expect(reconnect).not.toBeNull();
  expect(reconnect?.tagName).toBe("BUTTON");
  // 4: re-picking, stated honestly instead of offered.
  const text = container.textContent ?? "";
  expect(text).toContain("nothing to pick again");
  expect(container.querySelector("[data-calendar-event-repick]")).toBeNull();
});

test("Reconnect opens the Google connect window in place, naming this record's reason", async () => {
  await mount(UNAVAILABLE);

  await act(async () => {
    container
      .querySelector("[data-calendar-event-reconnect]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(connectOpens).toHaveLength(1);
  expect(connectOpens[0].reason).toContain("calendar");
  // Nothing navigated: no anchor is what carries this action.
  expect(container.querySelector("a[href='/user-settings/integrations']")).toBeNull();
});

test(
  "Reconnect names THIS event's own connection, not whichever grant opens first " +
    "(Cursor Bugbot, PR 228)",
  async () => {
    await mount(UNAVAILABLE);

    await act(async () => {
      container
        .querySelector("[data-calendar-event-reconnect]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(connectOpens).toHaveLength(1);
    // A person with more than one Google account is sent to the grant that
    // refreshes THIS meeting, the same field the Doc sibling's
    // `UnavailableActions` already reads (`synced_via_connection_id`).
    expect(connectOpens[0].initialConnectionId).toBe(CONNECTION_ID);
  },
);

test("an event with no connection id on it opens Reconnect with none — never a guess", async () => {
  await mount(
    calendarEventRow({
      sync_status: "unavailable",
      sync_status_reason: "Google Calendar says this event no longer exists.",
      synced_via_connection_id: null,
    }),
  );

  await act(async () => {
    container
      .querySelector("[data-calendar-event-reconnect]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(connectOpens).toHaveLength(1);
  expect(connectOpens[0].initialConnectionId).toBeUndefined();
});

test("a DETACHED event offers no Reconnect — the person chose this, and nothing repairs a choice", async () => {
  await mount(
    calendarEventRow({
      sync_status: "detached",
      sync_status_reason: "Kept as AI Matrx data: this event no longer refreshes from Google Calendar.",
    }),
  );

  expect(container.querySelector("[data-calendar-event-detached]")).not.toBeNull();
  expect(container.querySelector("[data-calendar-event-reconnect]")).toBeNull();
});
