/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleAgendaWindow } from "./GoogleAgendaWindow";

let mockAdmission = { isSuperAdmin: false, email: "ordinary@example.com" };

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectIsSuperAdmin: () => mockAdmission.isSuperAdmin,
  selectUserEmail: () => mockAdmission.email,
}));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/features/google-workspace/calendar/AgendaPanel", () => ({
  AgendaPanel: () => <div>Agenda body</div>,
}));
jest.mock("@/features/google-workspace/calendar/SelectedCalendarReview", () => ({
  SelectedCalendarReview: () => <div>Selected review body</div>,
}));
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  });

  it("shows the reviewer only for the server-matched OAuth review identity", () => {
    mockAdmission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen />));
    expect(host.textContent).toContain("Selected calendar");
    expect(host.textContent).toContain("Selected review body");
  });

  it("shows the reviewer for a super admin in the admin lane", () => {
    mockAdmission = { isSuperAdmin: true, email: "admin@example.com" };
    act(() => root.render(<GoogleAgendaWindow isOpen />));
    expect(host.textContent).toContain("Selected calendar");
  });
});
