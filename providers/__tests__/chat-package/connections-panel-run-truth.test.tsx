import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockDispatch = jest.fn();
let mockAddedMcpServers: string[] = [];
let mockInfoEvents: { code: string; metadata: { attachments: { slug: string; state: string; tool_count: number }[] } }[] = [];
let mockWarnings: { code: string; metadata: { slug: string; reason: string } }[] = [];
jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => mockDispatch,
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@/lib/redux/hooks", () => jest.requireMock("@ai-matrx/chat/store/hooks"));
jest.mock("@ai-matrx/chat/agents/hooks/useMcpTools", () => ({
  useMcpCatalog: () => ({
    catalog: [], status: "succeeded", availabilityStatus: "succeeded",
    refreshAvailability: jest.fn(),
    serverStates: [{
      entry: { slug: "github", name: "GitHub", connectionId: null, iconUrl: null },
      truth: { state: "connected", reason: null }, toolCount: 12, attachable: [],
    }],
  }),
}));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/selectors", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/agent-definition/selectors"),
  selectAgentMcpServers: () => [], selectAgentRunControlsReady: () => true,
}));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/thunks", () => ({ fetchAgentRunControls: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/mcp/mcp.slice", () => ({ fetchCatalog: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectAgentIdFromInstance: () => () => "agent",
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors", () => ({
  selectBuilderAdvancedSettings: () => () => ({ addedMcpServers: mockAddedMcpServers }),
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors", () => ({
  selectPrimaryRequest: () => () => ({ warnings: mockWarnings, infoEvents: mockInfoEvents }),
}));
jest.mock("@/features/connectors/useConnectMcpServer", () => ({
  useConnectMcpServer: () => ({ connect: jest.fn(), connectingSlug: null }),
}));
jest.mock("@/features/connectors/useAttachResourcePicker", () => ({ useAttachResourcePicker: () => jest.fn() }));
jest.mock("@/features/connectors/useConversationAttachments", () => ({
  useConversationAttachments: () => ({ status: "succeeded", items: [] }),
}));
jest.mock("@/features/connectors/AttachedResourcesSection", () => ({ AttachedResourcesSection: () => null }));
jest.mock("@ai-matrx/chat/host/window-openers", () => ({ ...jest.requireActual("@ai-matrx/chat/host/window-openers"), useOpenLiveIntegrationsWindow: () => jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
import { ComposerConnectorsPanel } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerConnectorsPanel";

describe("Connections preserve per-chat access and run truth", () => {
  beforeAll(() => { Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true }); });
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mockWarnings = [];
    mockAddedMcpServers = [];
    mockInfoEvents = [];
    mockDispatch.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const render = () => act(() => root.render(<ComposerConnectorsPanel conversationId="chat" onNavigate={jest.fn()} />));

  it("offers a usable first-party connection even without an MCP connection row", () => {
    render();
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="GitHub in this chat"]');
    expect(toggle).not.toBeNull();
    act(() => toggle?.click());
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: {
      conversationId: "chat", changes: { addedMcpServers: ["github"] },
    } }));
  });

  it("shows an actual failed run over a healthy catalog and keeps its reason", () => {
    mockAddedMcpServers = ["github"];
    mockWarnings = [{ code: "mcp_server_unavailable", metadata: { slug: "github", reason: "Provider timed out" } }];
    render();
    expect(container.textContent).toContain("failed this run");
    expect(container.querySelector('[title="Provider timed out"]')).not.toBeNull();
    expect(container.textContent).toContain("Reconnect");
    expect(container.textContent).not.toContain("12 tools");
  });
  it("keeps a failed auto-injected connection visible even after it was switched off", () => {
    mockWarnings = [{ code: "mcp_server_unavailable", metadata: { slug: "github", reason: "Provider timed out" } }];
    render();
    expect(container.textContent).toContain("failed this run");
    expect(container.querySelector('[aria-label="GitHub in this chat"]')?.getAttribute("aria-checked")).toBe("false");
  });

  it.each([3, 0])("uses run evidence instead of the catalog count (%s)", (count) => {
    mockAddedMcpServers = ["github"];
    mockInfoEvents = [{ code: "mcp_attachments", metadata: { attachments: [{ slug: "github", state: "connected", tool_count: count }] } }];
    render();
    expect(container.textContent).not.toContain("12 tools");
    if (count > 0) expect(container.textContent).toContain("3 tools");
    else expect(container.textContent).not.toContain("0 tools");
  });

});

// The panel draws the host's connector marks through the package's UI slots (host/ui-slots).
import { registerChatUi as registerChatUiForPanel } from "@ai-matrx/chat/host/ui-slots";
import { ConnectorMark as HostConnectorMark } from "@/features/connectors/ConnectorMark";
import { connectorDefinitionFromMcp as hostConnectorDefinitionFromMcp } from "@/features/connectors/live-connectors";
import { useConversationAttachments as hostUseConversationAttachments } from "@/features/connectors/useConversationAttachments";
// The app registers it (providers/chatUiRegistration.ts); the package throws without it.
registerChatUiForPanel({
  useConversationAttachments: hostUseConversationAttachments,
  ConnectorMark: HostConnectorMark, connectorDefinitionFromMcp: hostConnectorDefinitionFromMcp });
