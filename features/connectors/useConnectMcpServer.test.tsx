import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import type { McpOAuthOutcome } from "@/features/agents/services/mcp-oauth/popup";

const mockDispatch = jest.fn();
const mockPopup = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
}));
jest.mock("@/features/agents/services/mcp-oauth/popup", () => ({
  startMcpOAuthPopup: (...args: unknown[]) => mockPopup(...args),
}));
jest.mock("@/features/agents/redux/mcp/mcp.slice", () => ({
  fetchCatalog: () => ({ type: "catalog" }),
  fetchAvailability: (payload: unknown) => ({ type: "availability", payload }),
  connectServer: (payload: unknown) => ({ type: "connect", payload }),
}));
jest.mock("@/features/github-integration/service", () => ({
  githubConnectUrl: jest.fn(),
}));
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
import { useConnectMcpServer } from "./useConnectMcpServer";

const notion: McpCatalogEntry = {
  serverId: "664215cc-038b-42f0-8d6c-dbf7f033835a",
  slug: "notion",
  name: "Notion",
  vendor: "Notion Labs",
  description: null,
  category: "productivity",
  iconUrl: null,
  color: null,
  websiteUrl: "https://www.notion.so",
  docsUrl: null,
  endpointUrl: "https://mcp.notion.com/mcp",
  transport: "http",
  authStrategy: "oauth_discovery",
  isOfficial: true,
  isFeatured: true,
  hasRemote: true,
  hasLocal: false,
  supportsMcpApps: false,
  serverStatus: "active",
  connectionReady: true,
  connectionId: null,
  connectionStatus: null,
  connectedAt: null,
  lastUsedAt: null,
  transportUsed: null,
  tokenExpiresAt: null,
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("MCP connection intent", () => {
  let root: Root;
  let container: HTMLDivElement;
  let controller: ReturnType<typeof useConnectMcpServer>;
  let finish: (result: McpOAuthOutcome) => void;
  function Harness() {
    controller = useConnectMcpServer();
    return <output>{controller.connectingSlug ?? "idle"}</output>;
  }
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPopup.mockImplementation(
      () =>
        new Promise<McpOAuthOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("opens one authorization for two presses before React rerenders", async () => {
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = controller.connect(notion);
      second = controller.connect(notion);
    });
    expect(mockPopup).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("notion");
    await act(async () => {
      finish({ ok: true, serverId: notion.serverId });
      await Promise.all([first, second]);
    });
    expect(container.textContent).toBe("idle");
    expect(mockDispatch.mock.calls.map((call) => call[0].type)).toEqual([
      "catalog",
      "availability",
    ]);
  });

  it("clears pending on cancellation without claiming a new connection", async () => {
    let pending!: Promise<void>;
    await act(async () => {
      pending = controller.connect(notion);
    });
    expect(container.textContent).toBe("notion");
    await act(async () => {
      finish({ ok: false, error: "Connection cancelled", cancelled: true });
      await pending;
    });
    expect(container.textContent).toBe("idle");
    expect(mockDispatch).not.toHaveBeenCalled();
    mockPopup.mockResolvedValue({
      ok: false,
      cancelled: true,
      error: "Cancelled",
    });
    await act(async () => {
      await controller.connect(notion);
    });
    expect(mockPopup).toHaveBeenCalledTimes(2);
  });

  it("requires Supabase configuration and preserves the configured read-only endpoint", async () => {
    const supabase = { ...notion, slug: "supabase", name: "Supabase" };
    await act(async () => {
      await controller.connect(supabase);
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/user-settings/integrations?provider=supabase",
    );
    expect(mockPopup).not.toHaveBeenCalled();
    const endpoint =
      "https://mcp.supabase.com/mcp?project_ref=test-project&read_only=true";
    mockPopup.mockResolvedValue({
      ok: false,
      cancelled: true,
      error: "Cancelled",
    });
    await act(async () => {
      await controller.connect(supabase, endpoint);
    });
    expect(mockPopup).toHaveBeenCalledWith(
      supabase.serverId,
      undefined,
      endpoint,
    );
    expect(container.textContent).toBe("idle");
  });

  it("recovers from an authorization error so the next press can retry", async () => {
    mockPopup.mockRejectedValueOnce(new Error("Network unavailable"));
    await act(async () => {
      await controller.connect(notion);
    });
    expect(container.textContent).toBe("idle");
    expect(mockDispatch).not.toHaveBeenCalled();
    mockPopup.mockResolvedValue({
      ok: false,
      cancelled: true,
      error: "Cancelled",
    });
    await act(async () => {
      await controller.connect(notion);
    });
    expect(mockPopup).toHaveBeenCalledTimes(2);
  });
});
