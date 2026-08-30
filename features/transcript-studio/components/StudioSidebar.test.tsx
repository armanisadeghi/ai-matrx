import { renderToString } from "react-dom/server";
import { StudioSidebar } from "./StudioSidebar";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));

jest.mock("../redux/selectors", () => ({
  selectActiveSessionId: () => null,
  selectAllSessions: () => [{ id: "session-1" }],
  selectFetchStatus: () => "success",
}));

jest.mock("@/features/shell/components/header/templates/MobilePanelShell", () => ({
  useMobilePanelClose: () => jest.fn(),
}));

jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => <div data-testid="copy-controls" />,
}));

jest.mock("@/components/agent-copy/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-controls" />,
}));

describe("StudioSidebar hydration boundary", () => {
  it("omits warm-store session controls from the server/first-client shell", () => {
    const html = renderToString(<StudioSidebar />);

    expect(html).not.toContain("copy-controls");
    expect(html).not.toContain("export-controls");
    expect(html).toContain("New");
  });
});
