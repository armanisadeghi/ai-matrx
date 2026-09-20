import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRequestAuthorizationCode = jest.fn();
const mockConnectMutateAsync = jest.fn();
const mockRefetch = jest.fn();
let mockConnections: GoogleConnectionSummary[] = [];
let mockActiveOrgId: string | null = null;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  useGoogleAPI: () => ({
    isGoogleLoaded: true,
    isInitializing: false,
    requestAuthorizationCode: mockRequestAuthorizationCode,
  }),
  isGoogleAuthorizationCancelled: () => false,
}));

jest.mock("@/features/marketing/data/hooks", () => ({
  useSiteOptions: () => ({ data: [] }),
}));

jest.mock("@/features/organizations/hooks/useActiveOrganizationPicker", () => ({
  useActiveOrganizationPicker: () => ({ activeOrgId: mockActiveOrgId }),
}));

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: { connections: mockConnections, resources: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
  }),
  useConnectGoogle: () => ({ mutateAsync: mockConnectMutateAsync }),
  useDisconnectGoogle: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useYouTubeChannelPreview: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      userAuth: { adminLevel: "super_admin", email: "admin@admin.com" },
    }),
}));

jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { MarketingConnectionsWorkspace } from "./MarketingConnectionsWorkspace";

const ARMAN26_PERSONAL_CONNECTION: GoogleConnectionSummary = {
  id: "connection-arman26-personal",
  owner_type: "user",
  owner_user_id: "admin-user",
  organization_id: null,
  provider: "google",
  provider_subject: "google-subject-arman26",
  account_email: "arman26@gmail.com",
  account_name: "Arman Sadeghi",
  // The duplicate is representative of a previously accumulated grant. The
  // reconnect request must still present the one exact focused set to GIS.
  scopes: [
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.analyticsReadonly,
    GOOGLE_SCOPE.youtubeReadonly,
    GOOGLE_SCOPE.youtubeReadonly,
  ],
  status: "needs_attention",
  last_verified_at: null,
  last_error: "Google consent was revoked.",
  created_at: "2026-09-14T00:00:00Z",
  updated_at: "2026-09-14T00:00:00Z",
  metadata: {},
  credential_present: false,
  credential_stable: true,
  health: "needs_reauth",
  capability_health: null,
};

function organizationConnection(): GoogleConnectionSummary {
  return {
    ...ARMAN26_PERSONAL_CONNECTION,
    id: "connection-original-org",
    owner_type: "organization",
    owner_user_id: null,
    organization_id: "original-org",
    provider_subject: "google-subject-original-org",
    account_email: "shared-owner@example.com",
    account_name: "Original organization owner",
  };
}

describe("MarketingConnectionsWorkspace reconnect row", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnections = [];
    mockActiveOrgId = null;
    mockRequestAuthorizationCode.mockResolvedValue("authorization-code");
    mockConnectMutateAsync.mockResolvedValue({ connectionId: "reconnected" });
    mockRefetch.mockResolvedValue({ data: { connections: [], resources: [] } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function reconnectVisibleRow() {
    const reconnect = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Reconnect");
    expect(reconnect).toBeDefined();
    await act(async () => {
      reconnect?.click();
      await Promise.resolve();
    });
  }

  it("reconnects the rendered arman26 personal row with its exact focused grant and identity", async () => {
    mockConnections = [ARMAN26_PERSONAL_CONNECTION];

    act(() => {
      root.render(<MarketingConnectionsWorkspace />);
    });
    await reconnectVisibleRow();

    const expectedScopes = [
      ...GOOGLE_IDENTITY_SCOPES,
      GOOGLE_SCOPE.analyticsReadonly,
      GOOGLE_SCOPE.youtubeReadonly,
    ];
    expect(mockRequestAuthorizationCode).toHaveBeenCalledWith(
      expectedScopes,
      "arman26@gmail.com",
      { forceConsent: true },
    );
    expect(mockRequestAuthorizationCode.mock.calls[0][0]).not.toContain(
      GOOGLE_SCOPE.webmastersReadonly,
    );
    expect(mockConnectMutateAsync).toHaveBeenCalledWith({
      code: "authorization-code",
      owner: { type: "user" },
      options: { targetConnectionId: "connection-arman26-personal" },
    });
  });

  it("reconnects the rendered organization row into its original organization", async () => {
    mockConnections = [organizationConnection()];
    mockActiveOrgId = "active-org-that-must-not-replace-the-row-owner";

    act(() => {
      root.render(<MarketingConnectionsWorkspace />);
    });
    await reconnectVisibleRow();

    expect(mockRequestAuthorizationCode).toHaveBeenCalledWith(
      [
        ...GOOGLE_IDENTITY_SCOPES,
        GOOGLE_SCOPE.analyticsReadonly,
        GOOGLE_SCOPE.youtubeReadonly,
      ],
      "shared-owner@example.com",
      { forceConsent: true },
    );
    expect(mockConnectMutateAsync).toHaveBeenCalledWith({
      code: "authorization-code",
      owner: { type: "organization", organizationId: "original-org" },
      options: { targetConnectionId: "connection-original-org" },
    });
  });
});
