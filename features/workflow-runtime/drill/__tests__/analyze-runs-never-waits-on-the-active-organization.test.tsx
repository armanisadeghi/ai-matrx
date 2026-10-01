/**
 * /workflows/runs/analyze NEVER WAITS ON THE ACTIVE ORGANIZATION (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL
 * N1; the active-org-is-never-a-list-filter law).
 *
 * test@test.com in a fresh session (no organization chosen) was told "An organization is needed for run
 * analysis" and nothing loaded, although the mine lane counts every run she started in every organization.
 * Now: the organization the door is asked in is only the calendar (the chosen one, else her first), the
 * screen loads, and a visible organization filter (`?org_filter=`, default All organizations) narrows it.
 * Red on HEAD: no explorer rendered without an active organization, and there was no organization filter.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const captured: Record<string, Record<string, unknown>> = {};
let active: { organizationId: string | null; organizationState: string } = { organizationId: null, organizationState: "none" };
let filter: string | null = null;

jest.mock("@/components/official/drill-explorer/DrillExplorer", () => ({
  DrillExplorer: (p: Record<string, unknown>) => {
    captured[p.lane as string] = p;
    return null;
  },
}));
jest.mock("@/features/admin/usage-drill/useUsageDrill", () => ({ usageNameResolver: () => ({ resolve: jest.fn() }) }));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({ useOrganizationRequired: () => active }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [{ id: "org-green", name: "Greenline Recycling" }, { id: "org-north", name: "Northwind Dental" }], loading: false, error: null, refresh: () => undefined }),
}));
jest.mock("@/lib/entity-list/orgFilterUrl", () => ({ useOrgFilterParam: () => [filter, (id: string | null) => (filter = id)] }));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({ EntityOrgFilter: () => <span data-org-filter="" /> }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({ OrganizationContextNotice: () => <p data-notice="" /> }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ children }: { children: unknown }) => <a>{children as never}</a> }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => () => undefined }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: (p: unknown) => p, closeOverlay: (p: unknown) => p }));

import { WorkflowRunsExplorer } from "../WorkflowRunsExplorer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the mine lane of run analysis", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    for (const k of Object.keys(captured)) delete captured[k];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("loads with no active organization, asking in her first organization for its calendar only", () => {
    active = { organizationId: null, organizationState: "none" };
    filter = null;
    act(() => root.render(<WorkflowRunsExplorer lane="mine" />));
    expect(host.querySelector("[data-notice]")).toBeNull();
    expect(captured.mine?.organizationId).toBe("org-green");
    expect(captured.mine?.pageWhere).toBeUndefined();
  });

  it("the active organization is only the calendar, never a filter", () => {
    active = { organizationId: "org-north", organizationState: "ready" };
    filter = null;
    act(() => root.render(<WorkflowRunsExplorer lane="mine" />));
    expect(captured.mine?.organizationId).toBe("org-north");
    expect(captured.mine?.pageWhere).toBeUndefined();
  });

  it("the page's organization filter narrows every ask", () => {
    active = { organizationId: null, organizationState: "none" };
    filter = "org-north";
    act(() => root.render(<WorkflowRunsExplorer lane="mine" />));
    expect(captured.mine?.pageWhere).toEqual({ organization: "org-north" });
  });
});
