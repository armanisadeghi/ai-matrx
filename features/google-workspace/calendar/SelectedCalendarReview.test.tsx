/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectedCalendarEventRow } from "./SelectedCalendarReview";
import type { SelectedEvent } from "./selectedCalendarService";

const ORGANIZER = "organizer@example.com";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({}),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({}),
}));
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => jest.fn(),
}));

const event: SelectedEvent = {
  id: "event-1",
  title: "Private board meeting",
  starts_at: "2026-09-26T16:00:00Z",
  ends_at: "2026-09-26T17:00:00Z",
  time_zone: "America/Los_Angeles",
  status: "confirmed",
  organizer_email: ORGANIZER,
  attendees: [{ email: "person@example.com", responseStatus: "accepted" }],
  meeting_url: "https://meet.google.com/abc-defg-hij",
  updated_at: null,
  recurring_event_id: null,
  original_start_time: null,
  detail_visible: false,
};

describe("SelectedCalendarEventRow", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders only Busy and time when Google withholds event details", () => {
    act(() => root.render(<SelectedCalendarEventRow event={event} />));
    expect(host.textContent).toContain("Busy");
    expect(host.textContent).not.toContain(event.title);
    expect(host.textContent).not.toContain(ORGANIZER);
    expect(host.textContent).not.toContain("person@example.com");
    expect(host.querySelector("a")).toBeNull();
  });
});
