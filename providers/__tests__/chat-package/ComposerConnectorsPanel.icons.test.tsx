import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { McpCatalogEntry } from "@ai-matrx/chat/agents/types/mcp.types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mockEntries: McpCatalogEntry[] = [];
const mockDispatch = jest.fn();
jest.mock("@ai-matrx/chat/store/hooks", () => ({ useAppDispatch: () => mockDispatch, useAppSelector: () => undefined }));
jest.mock("@ai-matrx/chat/agents/hooks/useMcpTools", () => ({ useMcpCatalog: () => ({ catalog: mockEntries, serverStates: mockEntries.map(entry => ({ entry, truth: { state: "connected", reason: null }, toolCount: 1, attachable: [] })), status: "succeeded", availabilityStatus: "succeeded", refreshAvailability: jest.fn() }) }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors", () => ({ selectPrimaryRequest: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/selectors", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/agent-definition/selectors"), selectAgentRunControlsReady: jest.fn(), selectAgentMcpServers: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors", () => ({ selectAgentIdFromInstance: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors", () => ({ selectBuilderAdvancedSettings: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice", () => ({ setBuilderAdvancedSettings: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/thunks", () => ({ fetchAgentRunControls: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/redux/mcp/mcp.slice", () => ({ fetchCatalog: jest.fn() }));
jest.mock("@ai-matrx/chat/host/window-openers", () => ({ useOpenLiveIntegrationsWindow: () => jest.fn() }));
jest.mock("@/features/connectors/useConnectMcpServer", () => ({ useConnectMcpServer: () => ({ connect: jest.fn(), connectingSlug: null }) }));
jest.mock("@/features/connectors/useAttachResourcePicker", () => ({ useAttachResourcePicker: () => jest.fn() }));
jest.mock("@/features/connectors/useConversationAttachments", () => ({ useConversationAttachments: () => ({ items: [], status: "succeeded" }) }));
jest.mock("@/features/connectors/AttachedResourcesSection", () => ({ AttachedResourcesSection: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ComposerConnectorsPanel } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerConnectorsPanel";
function entry(extra: Partial<McpCatalogEntry> = {}): McpCatalogEntry {
  return { serverId: "server", slug: "example", name: "Example", vendor: "Example", description: null, category: "productivity", iconUrl: "/missing.svg", color: "#123456", websiteUrl: null, docsUrl: null, endpointUrl: null, transport: "http", authStrategy: "none", isOfficial: true, isFeatured: false, hasRemote: true, hasLocal: false, supportsMcpApps: false, serverStatus: "active", connectionReady: true, connectionId: "connection", connectionStatus: "connected", connectedAt: null, lastUsedAt: null, transportUsed: null, tokenExpiresAt: null, ...extra };
}
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(entries: McpCatalogEntry[]) { mockEntries = entries; await act(async () => root.render(<ComposerConnectorsPanel conversationId="test" onNavigate={jest.fn()} />)); }
function failImage() { const image = container.querySelector("img"); if (!image) throw new Error("Missing provider image"); act(() => image.dispatchEvent(new Event("error"))); }

test("a failed catalog image leaves visible provider identity instead of a broken image", async () => {
  await render([entry()]); failImage();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('span[aria-hidden]')?.textContent).toBe("E");
});
test("chat walks the same provider artwork chain and ends with visible identity", async () => {
  await render([entry({ name: "Datadog", websiteUrl: "https://www.datadoghq.com/" })]);
  // 8a12f2f1ac: brand glyph, Google's 128px site icon, catalogue art, then the raw favicon last.
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.simpleicons.org/datadog");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toContain("google.com/s2/favicons");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toBe("/missing.svg");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toBe("https://www.datadoghq.com/favicon.ico");
  failImage(); expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('span[aria-hidden]')?.textContent).toBe("D");
});
test("first-party Google uses its local mark even with a broken catalog URL", async () => {
  await render([entry({ slug: "google-workspace", name: "Google" })]);
  const row = container.querySelector('[aria-label="Google in this chat"]')?.closest("div");
  expect(row?.querySelector("svg")).not.toBeNull();
  expect(container.querySelector("img")).toBeNull();
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
