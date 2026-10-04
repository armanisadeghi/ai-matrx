/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { SelectedCalendarReviewContent } from "./SelectedCalendarReview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockChangeProps = jest.fn();
const mockCreateProps = jest.fn();

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    isLoading: false,
    isError: false,
    data: { connections: [{
      id: "connection-cedar",
      account_email: "admin@admin.com",
      owner_type: "user",
      owner_user_id: "admin-reviewer",
      health: "connected",
      scopes: [GOOGLE_SCOPE.calendarListReadonly, GOOGLE_SCOPE.calendarEventsWrite],
    }] },
  }),
  useGoogleCapabilities: () => ({ data: [{ key: "calendar_write", eligible: true }] }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "admin-reviewer" }));
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({ useOpenGoogleConnectWindow: () => jest.fn() }));
jest.mock("@/features/marketing/google/presentation", () => ({ googleConnectionLabel: () => "admin@admin.com" }));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({ onConnectionChange }: { onConnectionChange: (value: string) => void }) =>
    <button type="button" onClick={() => onConnectionChange("connection-cedar")}>Choose Cedar account</button>,
}));
jest.mock("./selectedCalendarService", () => ({
  discoverSelectedCalendars: jest.fn(async () => [{ id: "cedar-calendar", summary: "Cedar Review", primary: false, access_role: "owner", time_zone: "America/Los_Angeles" }]),
  readSelectedCalendarEvents: jest.fn(),
  reconcileSelectedCalendar: jest.fn(),
}));
jest.mock("./CalendarCreateReview", () => ({ CalendarCreateReview: (props: unknown) => { mockCreateProps(props); return <div data-create-review />; } }));
jest.mock("./CalendarEventChangeReview", () => ({ CalendarEventChangeReview: (props: unknown) => { mockChangeProps(props); return <div data-change-review />; } }));

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("SelectedCalendarReview event changes", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockChangeProps.mockClear(); mockCreateProps.mockClear();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("mounts create and existing-event controls through the same eligible write connection before a window read", async () => {
    await act(async () => root.render(<SelectedCalendarReviewContent organizationId="organization-cedar" />));
    act(() => button(host, "Choose Cedar account").click());
    await act(async () => button(host, "Discover calendars").click());
    const calendarSelect = host.querySelector<HTMLButtonElement>("#selected-calendar");
    expect(calendarSelect).not.toBeNull();
    act(() => calendarSelect?.click());
    const calendarOption = Array.from(document.querySelectorAll<HTMLElement>("[role='option']"))
      .find((option) => option.textContent?.includes("Cedar Review"));
    expect(calendarOption).not.toBeNull();
    act(() => calendarOption?.click());

    expect(host.querySelector("[data-create-review]")).not.toBeNull();
    expect(host.querySelector("[data-change-review]")).not.toBeNull();
    expect(mockChangeProps).toHaveBeenLastCalledWith(expect.objectContaining({
      actorId: "admin-reviewer",
      organizationId: "organization-cedar",
      connectionId: "connection-cedar",
      accountLabel: "admin@admin.com",
      calendar: expect.objectContaining({ id: "cedar-calendar" }),
      events: undefined,
    }));
  });
});
