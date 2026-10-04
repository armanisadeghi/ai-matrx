import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { McpCatalogEntry } from "../../../../types/mcp.types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mockEntries: McpCatalogEntry[] = [];
const mockDispatch = jest.fn();
jest.mock("../../../../../store/hooks", () => ({ useAppDispatch: () => mockDispatch, useAppSelector: () => undefined }));
jest.mock("../../../../hooks/useMcpTools", () => ({ useMcpCatalog: () => ({ catalog: mockEntries, serverStates: mockEntries.map(entry => ({ entry, truth: { state: "connected", reason: null }, toolCount: 1, attachable: [] })), status: "succeeded", availabilityStatus: "succeeded", refreshAvailability: jest.fn() }) }));
jest.mock("../../../../redux/execution-system/active-requests/active-requests.selectors", () => ({ selectPrimaryRequest: jest.fn() }));
jest.mock("../../../../redux/agent-definition/selectors", () => ({ selectAgentReadyForCustomExecution: jest.fn(), selectAgentMcpServers: jest.fn() }));
jest.mock("../../../../redux/execution-system/conversations/conversations.selectors", () => ({ selectAgentIdFromInstance: jest.fn() }));
jest.mock("../../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors", () => ({ selectBuilderAdvancedSettings: jest.fn() }));
jest.mock("../../../../redux/execution-system/instance-ui-state/instance-ui-state.slice", () => ({ setBuilderAdvancedSettings: jest.fn() }));
jest.mock("../../../../redux/agent-definition/thunks", () => ({ fetchAgentExecutionFull: jest.fn() }));
jest.mock("../../../../redux/mcp/mcp.slice", () => ({ fetchCatalog: jest.fn() }));
jest.mock("../../../../../host/window-openers", () => ({ useOpenLiveIntegrationsWindow: () => jest.fn() }));
jest.mock("@host/features/connectors/useConnectMcpServer", () => ({ useConnectMcpServer: () => ({ connect: jest.fn(), connectingSlug: null }) }));
jest.mock("@host/features/connectors/useAttachResourcePicker", () => ({ useAttachResourcePicker: () => jest.fn() }));
jest.mock("@host/features/connectors/useConversationAttachments", () => ({ useConversationAttachments: () => ({ items: [], status: "succeeded" }) }));
jest.mock("@host/features/connectors/AttachedResourcesSection", () => ({ AttachedResourcesSection: () => null }));
jest.mock("@host/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ComposerConnectorsPanel } from "./ComposerConnectorsPanel";
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
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://www.datadoghq.com/favicon.ico");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.simpleicons.org/datadog");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toBe("/missing.svg");
  failImage(); expect(container.querySelector("img")?.getAttribute("src")).toContain("google.com/s2/favicons");
  failImage(); expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('span[aria-hidden]')?.textContent).toBe("D");
});
test("first-party Google uses its local mark even with a broken catalog URL", async () => {
  await render([entry({ slug: "google-workspace", name: "Google" })]);
  const row = container.querySelector('[aria-label="Google in this chat"]')?.closest("div");
  expect(row?.querySelector("svg")).not.toBeNull();
  expect(container.querySelector("img")).toBeNull();
});
