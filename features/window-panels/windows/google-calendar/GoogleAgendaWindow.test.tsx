/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readGoogleAgendaWindowLaunchData } from "@/features/google-workspace/calendar/window-types";
import { GoogleAgendaWindow } from "./GoogleAgendaWindow";

let mockAdmission = { isSuperAdmin: false, email: "ordinary@example.com" };

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () =>
  jest.requireMock("@/lib/redux/hooks"),
);
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectIsSuperAdmin: () => mockAdmission.isSuperAdmin,
  // 9b938b6a0f: the window asks the registered admin feature "google.internal-review", not the raw admin selector.
  selectAdminFeature: () => mockAdmission.isSuperAdmin,
  selectUserEmail: () => mockAdmission.email,
}));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/features/google-workspace/calendar/AgendaPanel", () => ({
  AgendaPanel: () => <div>Agenda body</div>,
}));
jest.mock("@/features/google-workspace/calendar/CalendarView", () => ({
  CalendarView: () => <div>Calendar body</div>,
}));
jest.mock(
  "@/features/google-workspace/calendar/SelectedCalendarReview",
  () => ({
    SelectedCalendarReview: () => <div>Selected review body</div>,
  }),
);
jest.mock("@/features/google-workspace/meet/MeetReview", () => ({
  MeetReview: () => <div>Meet review body</div>,
}));
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-current-view={value}>{children}</div>,
  TabsList: ({
    children,
    className,
    overflow,
  }: {
    children: React.ReactNode;
    className?: string;
    overflow?: string;
  }) => (
    <div data-tabs-list data-overflow={overflow} className={className}>
      {children}
    </div>
  ),
  TabsTrigger: ({
    children,
    className,
    value,
  }: {
    children: React.ReactNode;
    className?: string;
    value: string;
  }) => (
    <button data-tab={value} className={className}>
      {children}
    </button>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("GoogleAgendaWindow selected-calendar admission", () => {
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

  it("hides the internal selected-calendar reviewer from an ordinary account", () => {
    mockAdmission = { isSuperAdmin: false, email: "ordinary@example.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen />));
    expect(host.textContent).toContain("Agenda");
    expect(host.textContent).not.toContain("Selected calendar");
    expect(host.textContent).not.toContain("Selected review body");
    expect(host.textContent).not.toContain("Meet review");
    expect(host.querySelectorAll("[data-tab]")).toHaveLength(2);
  });

  it("shows the reviewer only for the server-matched OAuth review identity", () => {
    mockAdmission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen />));
    expect(host.textContent).toContain("Selected calendar");
    expect(host.textContent).toContain("Selected review body");
    expect(host.textContent).toContain("Meet review");
    expect(host.textContent).toContain("Meet review body");
    expect(host.querySelectorAll("[data-tab]")).toHaveLength(4);
    expect(host.querySelector("[data-tabs-list]")?.getAttribute("data-overflow")).toBe("scroll");
  });

  it("opens Meet directly for a reviewer and falls back after eligibility changes", () => {
    mockAdmission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen initialView="calendar" />));
    expect(host.querySelector("[data-current-view]")?.getAttribute("data-current-view")).toBe("calendar");
    act(() => root.render(<GoogleAgendaWindow isOpen initialView="meet" />));
    expect(host.querySelector("[data-current-view]")?.getAttribute("data-current-view")).toBe("meet");
    mockAdmission = { isSuperAdmin: false, email: "ordinary@example.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen initialView="meet" />));
    expect(host.querySelector("[data-current-view]")?.getAttribute("data-current-view")).toBe("calendar");
    expect(host.textContent).not.toContain("Meet review body");
  });

  it("shows the reviewer for a super admin in the admin lane", () => {
    mockAdmission = { isSuperAdmin: true, email: "admin@example.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen />));
    expect(host.textContent).toContain("Selected calendar");
    expect(host.textContent).toContain("Meet review");
  });
});

test("restored Calendar launch data accepts known tabs and rejects malformed values", () => {
  expect(readGoogleAgendaWindowLaunchData({ initialView: "meet" })).toEqual({ initialView: "meet" });
  for (const value of [null, "meet", { initialView: "unknown" }, { initialView: 4 }, {}]) expect(readGoogleAgendaWindowLaunchData(value)).toEqual({});
});
