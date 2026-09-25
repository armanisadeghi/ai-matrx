/**
 * ORG-GATE-AUDIT residue — a caller rendering its OWN inline fallback after a
 * catch still showed that fallback when the organization picker was closed.
 *
 * `connectServerWithCredentials` (features/agents/redux/mcp/mcp.slice.ts) goes
 * through `mcp-connections.service`'s `persistMcpManualCredentials`, which
 * asks via `ensureOrganizationForRequest` when no organization is selected.
 * It is dispatched as a Redux thunk and awaited with `.unwrap()`, so a
 * cancellation reaches these forms' `catch` blocks as Redux Toolkit's
 * SERIALIZED error — a plain object carrying `name`, not an `Error` instance
 * (see lib/organization/selection-cancelled.ts). Each of the three manual
 * connect forms (Bearer Token, API Key, Env Var) tested
 *
 *   err instanceof Error ? err.message : "Connection failed"
 *
 * so on a cancellation `err instanceof Error` is false and the form showed
 * the hardcoded "Connection failed" line even though "nothing happened" is
 * the rule (closing the picker means "not now").
 *
 * Fails on the pre-fix source (no `isOrganizationSelectionCancelled` guard):
 * each case below found "Connection failed" on screen. Passes now: the guard
 * returns before `setError`, so nothing renders.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import mcpReducer from "@/features/agents/redux/mcp/mcp.slice";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";

const mockPersistMcpManualCredentials = jest.fn();
const mockFetchMcpServerConfigs = jest.fn();

jest.mock("@/features/agents/services/mcp-connections.service", () => ({
  ...jest.requireActual("@/features/agents/services/mcp-connections.service"),
  persistMcpManualCredentials: (...args: unknown[]) =>
    mockPersistMcpManualCredentials(...args),
}));
jest.mock("@/features/agents/services/mcp.service", () => ({
  ...jest.requireActual("@/features/agents/services/mcp.service"),
  fetchMcpServerConfigs: (...args: unknown[]) =>
    mockFetchMcpServerConfigs(...args),
}));

import {
  BearerTokenForm,
  ApiKeyForm,
  EnvVarForm,
} from "./AgentToolsManager";
import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";

const ENTRY: McpCatalogEntry = {
  serverId: "srv-1",
  slug: "acme",
  name: "Acme",
  vendor: "Acme Inc",
  description: null,
  category: "productivity",
  iconUrl: null,
  color: null,
  websiteUrl: null,
  docsUrl: null,
  endpointUrl: null,
  transport: "http",
  authStrategy: "bearer",
  isOfficial: false,
  isFeatured: false,
  hasRemote: true,
  hasLocal: false,
  supportsMcpApps: false,
  serverStatus: "active",
} as unknown as McpCatalogEntry;

function makeStore() {
  return configureStore({ reducer: { mcp: mcpReducer } });
}

let container: HTMLElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<Provider store={makeStore()}>{node}</Provider>);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function unmount() {
  act(() => root.unmount());
  container.remove();
}

describe("MCP manual connect forms — organization selection cancelled", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.clearAllMocks();
    mockFetchMcpServerConfigs.mockResolvedValue([
      {
        id: "cfg-1",
        label: "Default",
        isDefault: true,
        notes: null,
        envSchema: [],
      },
    ]);
    // Redux Toolkit serializes a thrown Error via miniSerializeError before
    // `.unwrap()` rethrows it, dropping the prototype — exactly the shape
    // `selectOrganizationCancelled.ts` documents `.unwrap()` producing.
    mockPersistMcpManualCredentials.mockImplementation(async () => {
      const cancelled = new OrganizationSelectionCancelled();
      throw { name: cancelled.name, message: cancelled.message, stack: cancelled.stack };
    });
  });

  it("Bearer Token form shows nothing, not 'Connection failed'", async () => {
    mount(<BearerTokenForm entry={ENTRY} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new Event("focus", { bubbles: true }));
    });
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      nativeSetter.call(input, "a-token");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save & Connect"),
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
      await flush();
    });
    expect(container.textContent).not.toMatch(/Connection failed/);
    unmount();
  });

  it("API Key form shows nothing, not 'Connection failed'", async () => {
    mount(<ApiKeyForm entry={ENTRY} />);
    // Two inputs render: "Header Name" first, "API Key" second.
    const input = container.querySelectorAll("input")[1] as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      nativeSetter.call(input, "a-key");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save & Connect"),
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
      await flush();
    });
    expect(container.textContent).not.toMatch(/Connection failed/);
    unmount();
  });

  it("Env Var form shows nothing, not 'Connection failed'", async () => {
    mount(<EnvVarForm entry={ENTRY} />);
    await flush();
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save & Connect"),
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
      await flush();
    });
    expect(container.textContent).not.toMatch(/Connection failed/);
    unmount();
  });
});
