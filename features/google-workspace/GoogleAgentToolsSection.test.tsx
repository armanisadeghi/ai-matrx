/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleAgentToolsSection } from "./GoogleAgentToolsSection";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let agentUnwrap = () => Promise.resolve();
let assignmentUnwrap = () => Promise.resolve();
const dispatch = jest.fn((action: { type?: string }) => ({
  unwrap:
    action.type === "agent"
      ? agentUnwrap
      : action.type === "assignment"
        ? assignmentUnwrap
        : () => Promise.resolve(),
}));
const tools = jest.fn();
const toolsStatus = jest.fn();
const toolsError = jest.fn();
const agent = jest.fn();
const agentReady = jest.fn();
const model = jest.fn();
const modelReady = jest.fn();
const modelError = jest.fn();
const toolSupport = jest.fn();
let userId = "user-one";
let organizationId = "organization-one";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => userId,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => organizationId,
}));
jest.mock("@/features/agents/redux/tools/tools.selectors", () => ({
  selectAllTools: () => tools(),
  selectToolsStatus: () => toolsStatus(),
  selectToolsError: () => toolsError(),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAgentById: (_state: unknown, id: string) => agent(id),
  selectAgentReadyForCustomExecution: (_state: unknown, id: string) =>
    agentReady(id),
}));
jest.mock("@/features/ai-models/redux/modelRegistrySlice", () => ({
  fetchModelById: jest.fn((id: string) => ({ type: "model", id })),
  selectModelById: (_state: unknown, id: string) => model(id),
  selectModelDetailError: (_state: unknown, id: string) => modelError(id),
  selectModelFullyLoaded: (_state: unknown, id: string | null) =>
    modelReady(id),
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => {
  const actual = jest.requireActual(
    "@/features/agents/redux/agent-definition/thunks",
  );
  return {
    ...actual,
    fetchAgentExecutionFull: jest.fn((id: string) => ({ type: "agent", id })),
    applyOwnedAgentToolDelta: jest.fn((input: unknown) => ({
      type: "assignment",
      input,
    })),
  };
});
jest.mock("@/features/agents/redux/tools/tools.thunks", () => ({
  fetchAvailableTools: jest.fn(() => ({ type: "tools" })),
}));
jest.mock("@/features/agents/hooks/useModelControls", () => ({
  resolveModelControls: () => ({ normalizedControls: { tools: {} } }),
  supportsTools: () => toolSupport(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@ai-matrx/agents/catalog/react", () => ({
  AgentListInlinePicker: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect("agent-one")}>
      Choose my agent
    </button>
  ),
}));

describe("GoogleAgentToolsSection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    toolsStatus.mockReturnValue("succeeded");
    userId = "user-one";
    organizationId = "organization-one";
    toolsError.mockReturnValue(null);
    agent.mockReturnValue({
      id: "agent-one",
      name: "Research agent",
      modelId: "model-one",
      tools: [],
    });
    agentReady.mockReturnValue(true);
    model.mockReturnValue({
      id: "model-one",
      _fetchType: "full",
      is_deprecated: false,
      deleted_at: null,
      retired_at: null,
    });
    modelReady.mockReturnValue(true);
    modelError.mockReturnValue(null);
    toolSupport.mockReturnValue(true);
    agentUnwrap = () => Promise.resolve();
    assignmentUnwrap = () => Promise.resolve();
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps agent assignment unavailable until the active google_marketing definition exists", () => {
    tools.mockReturnValue([]);
    act(() => root.render(<GoogleAgentToolsSection />));
    expect(host.textContent).toContain("Google data access is being prepared");
    expect(host.textContent).not.toContain("Choose my agent");
    expect(host.textContent).toContain(
      "https://server.app.matrxserver.com/api/mcp",
    );
    expect(host.textContent).toContain("Sign in with AI Matrx");
  });

  it("uses the active registry row and canonical owned-agent picker", async () => {
    tools.mockReturnValue([
      { id: "marketing-id", name: "google_marketing" },
      { id: "write-id", name: "google_workspace" },
    ]);
    act(() => root.render(<GoogleAgentToolsSection />));
    expect(host.textContent).toContain("Choose my agent");
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Choose my agent")
        ?.click(),
    );
    expect(host.textContent).toContain("Add Google marketing access");
    expect(host.textContent).toContain(
      "Create and edit selected Docs and Sheets; prepare email.",
    );
    dispatch.mockClear();
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Add Google marketing access")
        ?.click(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "assignment",
      input: {
        agentId: "agent-one",
        addToolIds: ["marketing-id"],
        removeToolIds: [],
      },
    });
  });

  it("shows serialized assignment errors and leaves the explicit action retryable", async () => {
    tools.mockReturnValue([{ id: "marketing-id", name: "google_marketing" }]);
    assignmentUnwrap = () =>
      Promise.reject({
        message:
          "This agent's tools, owner, or model changed while you were editing. Refresh the agent and retry your tool change.",
      });
    act(() => root.render(<GoogleAgentToolsSection />));
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Choose my agent")
        ?.click(),
    );
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Add Google marketing access")
        ?.click(),
    );
    expect(host.textContent).toContain("tools, owner, or model changed");
    expect(
      Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent === "Add Google marketing access",
      )?.disabled,
    ).toBe(false);
  });

  it("allows removal when an existing Google tool's model is missing or incapable", async () => {
    tools.mockReturnValue([{ id: "marketing-id", name: "google_marketing" }]);
    agent.mockReturnValue({
      id: "agent-one",
      name: "Research agent",
      modelId: null,
      tools: ["marketing-id"],
    });
    modelReady.mockReturnValue(false);
    act(() => root.render(<GoogleAgentToolsSection />));
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Choose my agent")
        ?.click(),
    );
    expect(host.textContent).toContain("no model selected");
    const remove = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Remove Google marketing access",
    ) as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    dispatch.mockClear();
    await act(async () => remove.click());
    expect(dispatch).toHaveBeenCalledWith({
      type: "assignment",
      input: {
        agentId: "agent-one",
        addToolIds: [],
        removeToolIds: ["marketing-id"],
      },
    });

    agent.mockReturnValue({
      id: "agent-one",
      name: "Research agent",
      modelId: "model-one",
      tools: ["marketing-id"],
    });
    modelReady.mockReturnValue(true);
    toolSupport.mockReturnValue(false);
    act(() => root.render(<GoogleAgentToolsSection />));
    expect(host.textContent).toContain("does not support tools");
    expect(
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Remove Google marketing access",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("drops a stale agent load after the actor or organization changes", async () => {
    tools.mockReturnValue([{ id: "marketing-id", name: "google_marketing" }]);
    agentReady.mockReturnValue(false);
    let resolveFirst: (() => void) | undefined;
    agentUnwrap = () =>
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    act(() => root.render(<GoogleAgentToolsSection />));
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Choose my agent")
        ?.click(),
    );
    userId = "user-two";
    organizationId = "organization-two";
    act(() => root.render(<GoogleAgentToolsSection />));
    await act(async () => resolveFirst?.());
    expect(host.textContent).not.toContain("This agent is unavailable");
  });
});
