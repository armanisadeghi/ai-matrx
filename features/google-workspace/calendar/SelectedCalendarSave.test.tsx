/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectedCalendarReview } from "./SelectedCalendarReview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockDiscover = jest.fn();
const mockRead = jest.fn();
const mockSave = jest.fn();

jest.mock("./selectedCalendarService", () => ({
  discoverSelectedCalendars: (...args: unknown[]) => mockDiscover(...args),
  readSelectedCalendarEvents: (...args: unknown[]) => mockRead(...args),
  reconcileSelectedCalendar: (...args: unknown[]) => mockSave(...args),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationId: "org-1", organizationState: "ready" }),
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: { connections: [{ id: "account-1", health: "connected", account_name: "Test", account_email: "test@example.com" }] },
    isLoading: false, isError: false,
  }),
}));
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => jest.fn(),
}));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({ onConnectionChange }: { onConnectionChange: (id: string) => void }) =>
    <button type="button" onClick={() => onConnectionChange("account-1")}>Choose account</button>,
}));
jest.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (id: string) => void }) =>
    <select aria-label="Calendar to review" onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const calendar = { id: "calendar-1", summary: "Team", primary: false, access_role: "reader", time_zone: "UTC" };
const complete = {
  connection_id: "account-1", calendar, window_start: "2026-09-27T00:00:00Z",
  window_end: "2026-10-04T00:00:00Z", events: [], truncated: false,
};

async function click(host: HTMLElement, label: string) {
  const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

async function selectCalendar(host: HTMLElement) {
  const select = host.querySelector("select");
  expect(select).not.toBeNull();
  await act(async () => {
    if (select) {
      select.value = "calendar-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

describe("selected calendar save gate", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mockDiscover.mockReset().mockResolvedValue([calendar]);
    mockRead.mockReset().mockResolvedValue(complete);
    mockSave.mockReset().mockResolvedValue({
      generation: 1, created: 2, updated: 1, scrubbed: 0,
      attendees_linked: 3, attendees_unlinked: 0, detached_preserved: 1,
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("offers an opt-in save only after a complete read and shows server counts", async () => {
    await act(async () => root.render(<SelectedCalendarReview />));
    expect(host.querySelector("[data-selected-calendar-save]")).toBeNull();
    await click(host, "Choose account");
    await click(host, "Discover calendars");
    await selectCalendar(host);
    await click(host, "Read selected events");
    expect(host.querySelector("[data-selected-calendar-save]")).not.toBeNull();
    await click(host, "Refresh and save selected calendar");
    expect(mockSave).toHaveBeenCalledWith({ organizationId: "org-1", connectionId: "account-1", calendarId: "calendar-1" });
    expect(host.querySelector("[data-selected-calendar-saved]")?.textContent).toContain("Created 2; updated 1");
    expect(host.querySelector("[data-selected-calendar-save]")).toBeNull();
  });

  it("never offers save for a truncated read", async () => {
    mockRead.mockResolvedValue({ ...complete, truncated: true });
    await act(async () => root.render(<SelectedCalendarReview />));
    await click(host, "Choose account");
    await click(host, "Discover calendars");
    await selectCalendar(host);
    await click(host, "Read selected events");
    expect(host.querySelector("[data-selected-calendar-save]")).toBeNull();
    expect(host.textContent).toContain("complete snapshot is required");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("clears the save action when the selected calendar changes", async () => {
    mockDiscover.mockResolvedValue([calendar, { ...calendar, id: "calendar-2", summary: "Other" }]);
    await act(async () => root.render(<SelectedCalendarReview />));
    await click(host, "Choose account");
    await click(host, "Discover calendars");
    await selectCalendar(host);
    await click(host, "Read selected events");
    expect(host.querySelector("[data-selected-calendar-save]")).not.toBeNull();
    await act(async () => {
      const select = host.querySelector("select");
      if (select) {
        select.value = "calendar-2";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(host.querySelector("[data-selected-calendar-save]")).toBeNull();
    expect(host.querySelector("[data-selected-calendar-result]")).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("does not restore a save action when an old read finishes after selection changes", async () => {
    let finishRead: ((value: typeof complete) => void) | undefined;
    mockRead.mockReturnValue(new Promise<typeof complete>((resolve) => { finishRead = resolve; }));
    await act(async () => root.render(<SelectedCalendarReview />));
    await click(host, "Choose account");
    await click(host, "Discover calendars");
    await selectCalendar(host);
    await click(host, "Read selected events");
    await click(host, "Choose account");
    await act(async () => finishRead?.(complete));
    expect(host.querySelector("[data-selected-calendar-save]")).toBeNull();
    expect(host.querySelector("[data-selected-calendar-result]")).toBeNull();
  });
});
