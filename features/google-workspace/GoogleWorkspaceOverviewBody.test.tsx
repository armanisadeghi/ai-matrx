/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleWorkspaceOverviewBody } from "@/features/google-workspace/GoogleWorkspaceOverviewBody";
import type {
  GoogleCapabilityMetadata,
  GoogleConnectionInventory,
} from "@/features/marketing/google/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInventory = jest.fn();
const mockCapabilities = jest.fn();
const mockConnect = jest.fn();

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => mockInventory(),
  useGoogleCapabilities: () => mockCapabilities(),
  useConnectGoogle: () => mockConnect(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => true }));
jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({
    connections,
    connectionId,
    onConnectionChange,
  }: {
    connections: Array<{ id: string; account_email: string | null }>;
    connectionId: string;
    onConnectionChange: (id: string) => void;
  }) => (
    <select
      aria-label="Choose account to inspect"
      value={connectionId}
      onChange={(event) => onConnectionChange(event.target.value)}
    >
      {connections.map((connection) => (
        <option key={connection.id} value={connection.id}>
          {connection.account_email}
        </option>
      ))}
    </select>
  ),
}));
jest.mock("@/features/google-workspace/GoogleAgentToolsSection", () => ({
  GoogleAgentToolsSection: () => <div data-testid="google-agent-tools" />,
}));

const keys = [
  "drive_files",
  "docs",
  "sheets",
  "gmail_send",
  "search_console",
  "analytics",
  "youtube",
  "contacts",
  "calendar",
  "tasks",
  "tag_manager",
  "youtube_analytics",
] as const;
const titles = [
  "Google Drive files",
  "Google Docs",
  "Google Sheets",
  "Reviewed Gmail send",
  "Google Search Console",
  "Google Analytics 4",
  "YouTube channel preview",
  "Google Contacts import",
  "Google Calendar agenda",
  "Google Tasks preview",
  "Google Tag Manager inventory",
  "YouTube Analytics",
];
const capabilities: GoogleCapabilityMetadata[] = keys.map((key, index) => ({
  key,
  title: titles[index]!,
  user_outcome: `Use ${titles[index]}.`,
  required_scopes: [
    { scope: "scope-a", provider_classification: "non_sensitive" },
  ],
  eligible_resource_types: key === "docs" ? ["google_document"] : [],
  rollout_phase: index > 6 ? "internal_test" : "available",
  native_tool_actions: [],
  mcp_tool_actions: [],
  limitation: "A bounded limitation.",
  remedy: "Use the available management path.",
  eligible: true,
  admission_error: null,
}));
const first = {
  id: "connection-one",
  owner_type: "user" as const,
  owner_user_id: "user",
  organization_id: null,
  provider: "google" as const,
  provider_subject: "subject-one",
  account_email: "one@example.com",
  account_name: null,
  scopes: ["scope-a"],
  status: "connected" as const,
  last_verified_at: null,
  last_error: null,
  created_at: "2026-09-15T00:00:00Z",
  updated_at: "2026-09-15T00:00:00Z",
  metadata: {},
  credential_present: true,
  credential_stable: true,
  health: "connected" as const,
};
const second = {
  ...first,
  id: "connection-two",
  provider_subject: "subject-two",
  account_email: "two@example.com",
};
const inventory: GoogleConnectionInventory = {
  connections: [first, second],
  resources: [
    {
      id: "resource-one",
      connection_id: first.id,
      resource_type: "google_document",
      resource_ref: "document-one",
      display_name: "Doc one",
      permission_level: "owner",
      discovered_at: "2026-09-15T00:00:00Z",
      metadata: {},
    },
  ],
};

describe("GoogleWorkspaceOverviewBody", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onAddAccount: jest.Mock;
  let onManageWorkspace: jest.Mock;
  const renderOverview = (initialConnectionId?: string) =>
    act(() =>
      root.render(
        <GoogleWorkspaceOverviewBody
          initialConnectionId={initialConnectionId}
          onAddAccount={onAddAccount}
          onManageWorkspace={onManageWorkspace}
        />,
      ),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    onAddAccount = jest.fn();
    onManageWorkspace = jest.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    mockInventory.mockReturnValue({
      data: inventory,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockCapabilities.mockReturnValue({
      data: capabilities,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockConnect.mockReturnValue({ mutateAsync: jest.fn() });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders all 12 descriptors and only real management actions", () => {
    renderOverview();
    titles.forEach((title) => expect(host.textContent).toContain(title));
    expect(
      host.querySelector('a[href="/marketing/operations/connections/google"]')
        ?.textContent,
    ).toContain("Manage Search Console");
    expect(host.textContent).toContain("Manage Google Analytics 4");
    expect(host.textContent).not.toContain("Manage Google Contacts import");
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Manage Google access"))
        ?.click(),
    );
    expect(onManageWorkspace).toHaveBeenCalledWith("connection-one");
  });

  it("keeps an unavailable explicit target explicit until another account is chosen", () => {
    renderOverview("missing");
    expect(host.textContent).toContain("no longer available");
    act(() =>
      (
        host.querySelector("button:not([disabled])") as HTMLButtonElement
      ).click(),
    );
    expect(
      (
        host.querySelector(
          'select[aria-label="Choose account to inspect"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("connection-one");
  });

  it("switches the inspected account", () => {
    renderOverview();
    const select = host.querySelector(
      'select[aria-label="Choose account to inspect"]',
    ) as HTMLSelectElement;
    act(() => {
      select.value = "connection-two";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select.value).toBe("connection-two");
  });

  it("does not call revoked matching scopes granted", () => {
    mockInventory.mockReturnValue({
      data: {
        ...inventory,
        connections: [{ ...first, health: "revoked" as const }],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderOverview();
    expect(host.textContent).toContain("Account permission: Needed");
    expect(host.textContent).not.toContain("Account permission: Granted");
  });

  it("renders loading and retries actual inventory and capability failures", () => {
    const inventoryRetry = jest.fn();
    mockInventory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: inventoryRetry,
    });
    renderOverview();
    expect(host.textContent).toContain("Loading Google account access…");
    mockInventory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: inventoryRetry,
    });
    renderOverview();
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(inventoryRetry).toHaveBeenCalledTimes(1);
    mockInventory.mockReturnValue({
      data: inventory,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const capabilityRetry = jest.fn();
    mockCapabilities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: capabilityRetry,
    });
    renderOverview();
    act(() =>
      (
        host.querySelector(
          'button[aria-label="Refresh"]',
        ) as HTMLButtonElement | null
      )?.click(),
    );
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Try again"))
        ?.click(),
    );
    expect(capabilityRetry).toHaveBeenCalledTimes(1);
  });
});
