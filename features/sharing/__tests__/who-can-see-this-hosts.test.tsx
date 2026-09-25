/**
 * 🚨 SHARE-LANE-CONTROL: ONE "Who can see this" control, rendered by every share host at the top of
 * its People tab — ShareModal, ShareModalWindow, AgentSharePanel, SiteAccessWorkspace — from
 * `useSharing().whoCanSee`, and Current Access beside it reads the same answer. One test per host.
 * The hosts' heavy children (people form, lists, access summary) are stood in for; the control and
 * the organization-default line are the real components.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "4c425bfe-9a08-402f-9496-488580623f42";
const TABLE = "5ebcf5ec-c40e-4621-b181-d96d2a7a017b";

const setWhoCanSee = jest.fn(async () => ({ success: true }));
const sharing = {
  permissions: [],
  isPublic: false,
  visibility: null,
  organizationDefault: { level: "viewer", organizationName: "Oak & River", organizationId: ORG },
  whoCanSee: {
    source: "store",
    choice: "organization",
    organizationId: ORG,
    organizationName: "Oak & River",
    memberDefaultLevel: "viewer",
    membersReachNow: true,
    worldOffered: false,
  },
  setWhoCanSee,
  setVisibility: jest.fn(),
  loading: false,
  error: null,
  shareWithUser: jest.fn(),
  makePublic: jest.fn(),
  revokeAccess: jest.fn(),
  revokeOrgAccess: jest.fn(),
  updateLevel: jest.fn(),
  refresh: jest.fn(),
  refreshVisibility: jest.fn(),
};

const useSharingCalls: unknown[][] = [];
jest.mock("@/utils/permissions/hooks", () => ({
  useSharing: (...args: unknown[]) => {
    useSharingCalls.push(args);
    return sharing;
  },
  useIsOwner: () => ({ isOwner: true, loading: false, error: null }),
}));
jest.mock("@/features/agent-context/hooks/useNavTree", () => ({
  useNavTree: () => ({ orgs: [{ id: ORG, name: "Oak & River" }], isLoading: false }),
}));
jest.mock("@/features/sharing/components/PermissionsList", () => ({ PermissionsList: () => null }));
jest.mock("@/features/sharing/components/tabs/ShareWithUserTab", () => ({ ShareWithUserTab: () => null }));
jest.mock("@/features/sharing/components/tabs/PublicAccessTab", () => ({ PublicAccessTab: () => null }));
jest.mock("@/features/sharing/components/AccessSummaryPanel", () => ({ AccessSummaryPanel: () => null }));
jest.mock("@/features/sharing/outside/OutsideSharePanel", () => ({ OutsideSharePanel: () => null }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCapture: () => undefined }));
jest.mock("@/components/agent-copy/page-capture/PageCaptureButton", () => ({ PageCaptureButton: () => null }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/marketing/components/site/MarketingSiteContext", () => ({
  useMarketingSite: () => ({
    site: { id: TABLE, name: "Oak & River nursery", domain: "oakandriver.co", organization_id: ORG },
  }),
}));

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

const expectControlAndDefaultRow = () => {
  const control = document.querySelector("[data-who-can-see]");
  expect(control).not.toBeNull();
  const org = control!.querySelector('[data-lane-choice="organization"]');
  expect(org?.getAttribute("aria-checked")).toBe("true");
  expect(org?.textContent).toContain("Everyone in Oak & River");
  expect(control!.querySelector('[data-lane-choice="mine"]')?.textContent).toContain("Only people I share it with");
  // Current Access agrees with the control: the organization-default row is listed.
  expect(document.querySelector("[data-organization-default]")?.textContent).toContain(
    "Everyone in Oak & River can view this through the organization's default.",
  );
};

describe("every share host renders the one Who can see this control", () => {
  it("ShareModal", async () => {
    const { ShareModal } = await import("@/features/sharing/components/ShareModal");
    act(() =>
      root.render(
        <ShareModal isOpen onClose={() => undefined} resourceType={"record" as never} resourceId={TABLE} resourceName="Spring planting orders" />,
      ),
    );
    expectControlAndDefaultRow();
  });

  it("ShareModalWindow", async () => {
    const { default: ShareModalWindow } = await import("@/features/window-panels/windows/ShareModalWindow");
    act(() =>
      root.render(
        <ShareModalWindow isOpen onClose={() => undefined} resourceType={"record" as never} resourceId={TABLE} resourceName="Spring planting orders" />,
      ),
    );
    expectControlAndDefaultRow();
  });

  it("AgentSharePanel", async () => {
    const { AgentSharePanel } = await import("@/features/agents/components/sharing/AgentSharePanel");
    act(() => root.render(<AgentSharePanel agentId={TABLE} isOwner agentName="Nursery order desk" />));
    expectControlAndDefaultRow();
  });

  it("SiteAccessWorkspace", async () => {
    const { SiteAccessWorkspace } = await import("@/features/marketing/components/access/SiteAccessWorkspace");
    act(() => root.render(<SiteAccessWorkspace view={"users" as never} />));
    expectControlAndDefaultRow();
    // SHARE-LANE-2: the site hands the hook its OWN organization, so the control can name it
    // ("Everyone in Oak & River") instead of falling back to "Everyone in this organization".
    const siteCall = useSharingCalls.filter((a) => a[0] === "web_site").at(-1);
    expect(siteCall?.[4]).toBe(ORG);
  });
});
