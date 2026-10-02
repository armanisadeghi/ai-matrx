/**
 * ON THE ADMIN SCREEN A RUN OPENS THROUGH ITS ADMIN DOOR (lane DRILL-ADOPT, VERIFY-DRILL-WAVE2 W2-2).
 *
 * The admin's workflow-runs explorer counts every run on the platform. It used to send him to
 * /workflows/runs — his OWN runs list, where the runs he counted but did not start cannot be opened
 * (a dead end, and the admin seat acting as itself). Now each run is a record of the definition
 * (`records`, run id) and opens in the run's own floating window, right on the admin page. In the
 * mine lane a person's run opens on its own page, beside the way back to her list.
 *
 * The data: the platform lane and the mine lane of workflow_runs; a run id from a record row.
 * Break it names: any link to /workflows/runs on the platform lane, or a run opening by address there → red.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const captured: Record<string, Record<string, unknown>> = {};
const dispatched: unknown[] = [];

jest.mock("@/components/official/drill-explorer/DrillExplorer", () => ({
  DrillExplorer: (p: Record<string, unknown>) => {
    captured[p.lane as string] = p;
    return null;
  },
}));
jest.mock("@/features/admin/usage-drill/useUsageDrill", () => ({ usageNameResolver: () => ({ resolve: jest.fn() }) }));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({ useOrganizationRequired: () => ({ organizationId: "org-1", organizationState: "ready" }) }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({ OrganizationContextNotice: () => null }));
// the mine lane's calendar organization and its organization filter (lane DRILL-FLIP-FIXES N1)
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [{ id: "org-1", name: "Greenline Recycling" }], loading: false, error: null, refresh: () => undefined }) }));
jest.mock("@/lib/entity-list/orgFilterUrl", () => ({ useOrgFilterParam: () => [null, () => undefined] }));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({ EntityOrgFilter: () => null }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => (a: unknown) => dispatched.push(a) }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({
  openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }),
  closeOverlay: (payload: unknown) => ({ type: "overlay/close", payload }),
}));

import { WorkflowRunsExplorer } from "../WorkflowRunsExplorer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a workflow run opens through the seat's own door", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("platform lane: a run opens in its own window on the admin page, and nothing links to the personal runs list", () => {
    act(() => root.render(<WorkflowRunsExplorer lane="platform" />));
    const p = captured.platform!;
    const open = p.openRecord as { column: string; href?: unknown; open?: (id: string) => void };
    expect(open.column).toBe("run_id");
    expect(open.href).toBeUndefined();
    open.open!("7d0f5c2e-4b1a-4c55-9a8e-3f2a1b6c9d10");
    expect(dispatched).toContainEqual(expect.objectContaining({ type: "overlay/open", payload: expect.objectContaining({ overlayId: "workflowRunWindow", data: expect.objectContaining({ runId: "7d0f5c2e-4b1a-4c55-9a8e-3f2a1b6c9d10" }) }) }));
    expect(p.recordsLink).toBeUndefined();
    expect(p.headerExtras).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/\/workflows\/runs/);
  });

  it("mine lane: her run opens on its own page, beside the way back to her list", () => {
    act(() => root.render(<WorkflowRunsExplorer lane="mine" />));
    const p = captured.mine!;
    const open = p.openRecord as { href?: (id: string) => string };
    expect(open.href!("run-9")).toBe("/workflows/runs/run-9");
    expect(p.headerExtras).toBeTruthy();
  });
});
