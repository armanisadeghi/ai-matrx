/**
 * 🚨 THE PEOPLE A SHARE DIALOG OFFERS ARE THE THING'S ORGANIZATION (PB-07, 2026-10-01).
 *
 * Every share host hands its people list the organization the shared thing lives in — the
 * opener's answer, else the row's own (`useSharing().homeOrganizationId`). Without one the list
 * read every organization the viewer belongs to, one roster after another, and a member of sixty
 * organizations watched "Loading contacts…" for minutes.
 *
 * RED BEFORE GREEN: before this change no host passed the row's organization, so every case
 * receives `organizationId: undefined`.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "4c425bfe-9a08-402f-9496-488580623f42";
const TABLE = "5ebcf5ec-c40e-4621-b181-d96d2a7a017b";
const HOME = "2c1d4319-bf0d-40bc-8ca1-657f4063d080";

const setWhoCanSee = jest.fn(async () => ({ success: true }));
const sharing = {
  permissions: [],
  isPublic: false,
  shownTo: undefined,
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
  setShownTo: jest.fn(),
  loading: false,
  error: null,
  shareWithUser: jest.fn(),
  makePublic: jest.fn(),
  revokeAccess: jest.fn(),
  revokeOrgAccess: jest.fn(),
  updateLevel: jest.fn(),
  refresh: jest.fn(),
  refreshRowState: jest.fn(),
  homeOrganizationId: HOME,
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
const contactProps: Array<{ organizationId?: string }> = [];
jest.mock("@/features/sharing/components/tabs/ShareWithUserTab", () => ({
  ShareWithUserTab: (props: { organizationId?: string }) => {
    contactProps.push(props);
    return null;
  },
}));
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
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
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
  contactProps.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const lastOrganization = () => contactProps.at(-1)?.organizationId;

describe("every share host scopes its people list to the shared thing's organization", () => {
  it("ShareModal uses the row's organization when the opener named none", async () => {
    const { ShareModal } = await import("@/features/sharing/components/ShareModal");
    act(() =>
      root.render(
        <ShareModal isOpen onClose={() => undefined} resourceType={"record" as never} resourceId={TABLE} resourceName="Crew line" />,
      ),
    );
    expect(lastOrganization()).toBe(HOME);
  });

  it("ShareModal prefers the opener's organization", async () => {
    const { ShareModal } = await import("@/features/sharing/components/ShareModal");
    act(() =>
      root.render(
        <ShareModal isOpen onClose={() => undefined} resourceType={"record" as never} resourceId={TABLE} resourceName="Crew line" organizationId={ORG} />,
      ),
    );
    expect(lastOrganization()).toBe(ORG);
  });

  it("ShareModalWindow", async () => {
    const { default: ShareModalWindow } = await import("@/features/window-panels/windows/ShareModalWindow");
    act(() =>
      root.render(
        <ShareModalWindow isOpen onClose={() => undefined} resourceType={"record" as never} resourceId={TABLE} resourceName="Crew line" />,
      ),
    );
    expect(lastOrganization()).toBe(HOME);
  });

  it("AgentSharePanel", async () => {
    const { AgentSharePanel } = await import("@/features/agents/components/sharing/AgentSharePanel");
    act(() => root.render(<AgentSharePanel agentId={TABLE} isOwner agentName="Dispatch" />));
    expect(lastOrganization()).toBe(HOME);
  });

  it("SiteAccessWorkspace uses the site's own organization", async () => {
    const { SiteAccessWorkspace } = await import("@/features/marketing/components/access/SiteAccessWorkspace");
    act(() => root.render(<SiteAccessWorkspace view={"users" as never} />));
    expect(lastOrganization()).toBe(ORG);
  });
});
