/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarCreateReview } from "./CalendarCreateReview";
import type { SelectedCalendar } from "./selectedCalendarService";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const readerCalendar = {
  id: "shared-calendar",
  summary: "Clinic coverage",
  primary: false,
  access_role: "reader",
  time_zone: "America/Los_Angeles",
} satisfies SelectedCalendar;

describe("CalendarCreateReview", () => {
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
});
