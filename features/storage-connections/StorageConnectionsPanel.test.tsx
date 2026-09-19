/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StorageConnectionsPanel } from "@/features/storage-connections/StorageConnectionsPanel";
import { readConnectionStatus } from "@/features/connectors/connection-status";
import type { StorageConnection } from "@/features/storage-connections/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockList = jest.fn();
const mockStart = jest.fn();
const mockRefresh = jest.fn();
const mockDisconnect = jest.fn();
const mockConfirm = jest.fn();
let searchParams = new URLSearchParams();

jest.mock("@/features/storage-connections/service", () => ({
  listStorageConnections: (...args: unknown[]) => mockList(...args),
  startStorageAuthorization: (...args: unknown[]) => mockStart(...args),
  refreshStorageConnection: (...args: unknown[]) => mockRefresh(...args),
  disconnectStorageConnection: (...args: unknown[]) => mockDisconnect(...args),
}));
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

let container: HTMLDivElement;
let root: Root;
const navigate = jest.fn();

function connection(
  provider: "box" | "dropbox",
  status: string,
): StorageConnection {
  return {
    id: `${provider}-connection`,
    provider,
    accountEmail: `${provider}@example.com`,
    accountName: null,
    scopes: [],
    status: readConnectionStatus(status),
    lastVerifiedAt: null,
    lastError: null,
    connectedAt: null,
    requestedScopes: [],
    grantedScopes: [],
    scopeEvidence: null,
  };
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockList.mockResolvedValue([]);
  mockStart.mockImplementation(async (provider: "box" | "dropbox") => ({
    authorizationUrl: `https://${provider}.example.test/authorize/server-minted`,
    provider,
    requestedScopes: [],
  }));
  mockRefresh.mockResolvedValue({ status: "connected" });
  mockDisconnect.mockResolvedValue({ status: "disconnected" });
  mockConfirm.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render() {
  await act(async () => {
    root.render(<StorageConnectionsPanel navigate={navigate} />);
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((node) =>
    (node.textContent ?? "").includes(text),
  );
  if (!found) throw new Error(`No button containing ${text}`);
  return found as HTMLButtonElement;
}

test("connect asks the server and navigates only to its returned URL", async () => {
  await render();
  await act(async () => button("Connect Dropbox").click());

  expect(mockStart).toHaveBeenCalledWith("dropbox");
  expect(navigate).toHaveBeenCalledWith(
    "https://dropbox.example.test/authorize/server-minted",
  );
});

test("provider limits distinguish file imports from hosted MCP agent tools", async () => {
  await render();
  expect(container.textContent).toContain(
    "browse and import its files into Matrx Files",
  );
  expect(container.textContent).toContain("Hosted MCP connections below");
  expect(container.textContent).toContain(
    "only the Dropbox account that owns the approved app",
  );
  expect(container.textContent).toContain(
    "cannot create, change, move, or delete Dropbox content",
  );
  expect(container.textContent).toContain("root-level read-only access");
});

test("a failed list never claims that no accounts exist", async () => {
  mockList.mockRejectedValueOnce(new Error("Connection list unavailable."));
  await render();
  expect(container.textContent).toContain("could not be listed");
  expect(container.textContent).not.toContain(
    "No Dropbox account is connected yet",
  );
  expect(container.textContent).not.toContain(
    "No Box account is connected yet",
  );
});

test("callback failures remain honest and scoped to storage providers", async () => {
  searchParams = new URLSearchParams("provider=box&oauth_status=failed");
  await render();
  expect(container.textContent).toContain("Nothing was saved as connected");

  searchParams = new URLSearchParams(
    "provider=microsoft&oauth_status=connected",
  );
  await act(async () =>
    root.render(<StorageConnectionsPanel navigate={navigate} />),
  );
  expect(container.textContent).not.toContain("Your file connection is ready");
});

test("needs-attention can reconnect while unavailable and unknown never claim connected", async () => {
  mockList.mockResolvedValueOnce([
    connection("dropbox", "needs_attention"),
    connection("box", "unavailable"),
    { ...connection("box", "future_state"), id: "box-unknown" },
  ]);
  await render();

  expect(button("Reconnect")).toBeTruthy();
  expect(container.textContent).toContain("Status unavailable");
  expect(container.textContent).toContain("No access is being claimed");
  expect(container.textContent).not.toContain("future_stateConnected");
});

test("connected accounts confirm the exact account before disconnect", async () => {
  mockList.mockResolvedValue([connection("box", "connected")]);
  await render();

  await act(async () => button("Check access").click());
  expect(mockRefresh).toHaveBeenCalledWith("box", "box-connection");

  await act(async () => button("Disconnect").click());
  expect(mockConfirm).toHaveBeenCalledWith({
    title: "Disconnect box@example.com?",
    description:
      "AI Matrx will stop reading from this Box account and retire this connection's token. Files you already imported into Matrx Files will remain. Only box@example.com will be disconnected.",
    confirmLabel: "Disconnect Box",
    variant: "destructive",
  });
  expect(mockDisconnect).toHaveBeenCalledWith("box", "box-connection");
});

test("cancelling disconnect has no effect", async () => {
  mockList.mockResolvedValue([connection("dropbox", "connected")]);
  mockConfirm.mockResolvedValueOnce(false);
  await render();

  await act(async () => button("Disconnect").click());

  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm.mock.calls[0][0].title).toBe(
    "Disconnect dropbox@example.com?",
  );
  expect(mockDisconnect).not.toHaveBeenCalled();
});
