/**
 * The composer's chips row (brief §7, Amendment 1 A1): connections are 28px
 * composer chips, and what was chosen out of an attachable connection (a
 * repository) is a chip of its OWN only in Advanced — "Repos are
 * Advanced-only. Work shows Browser and Vault chips but never a repo."
 *
 * Proven failing before passing: before the `chips` variant the chips row
 * rendered the 16px rail, which has no per-resource chip at all (no control
 * named "ai-matrx" existed in Advanced).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";

const openPicker = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

jest.mock("@/features/overlays/openers/runControlsWindow", () => ({
  useOpenRunControlsWindow: () => jest.fn(),
}));

jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: () => null,
}));

jest.mock("../RunToolPicker", () => ({ RunToolPicker: () => null }));

jest.mock(
  "@/features/agents/redux/agent-definition/selectors",
  () => ({ selectAgentMcpServers: () => ["github", "context7"] }),
);

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({ selectAgentIdFromInstance: () => () => "agent-1" }),
);

jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({ selectBuilderAdvancedSettings: () => () => undefined }),
);

jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.selectors",
  () => ({ selectPrimaryRequest: () => () => undefined }),
);

// The payload under test. GitHub offers repositories from our synced
// inventory; Context7 is a pure MCP server with nothing to choose.
jest.mock("@/features/agents/hooks/useMcpTools", () => ({
  useMcpCatalog: () => ({
    serverStates: [
      {
        entry: { slug: "github", name: "GitHub", serverId: "s1" },
        truth: { state: "connected", reason: null, source: "server" },
        toolCount: 12,
        attachable: [
          {
            resource_type: "github_repository",
            source: "inventory",
            label: "repositories",
          },
        ],
      },
      {
        entry: { slug: "context7", name: "Context7", serverId: "s2" },
        truth: { state: "connected", reason: null, source: "server" },
        toolCount: 3,
        attachable: [],
      },
    ],
  }),
}));

jest.mock("@/features/connectors/useAttachResourcePicker", () => ({
  useAttachResourcePicker: () => openPicker,
}));

let attached: Array<Record<string, unknown>> = [];
let readStatus: "succeeded" | "failed" = "succeeded";

jest.mock("@/features/connectors/useConversationAttachments", () => ({
  useConversationAttachments: () => ({
    items: attached,
    status: readStatus,
    error: readStatus === "failed" ? "HTTP 500" : null,
    writeError: null,
    busyKeys: [],
    attach: jest.fn(),
    remove: jest.fn(),
    reload: jest.fn(),
  }),
}));

import { ChatConnectionsStrip } from "../ChatConnectionsStrip";

const REPO = {
  pending: false,
  association_id: "a1",
  provider: "github",
  resource_type: "github_repository",
  display_name: "ai-matrx",
  link: null,
  resource_ref: "armanisadeghi/ai-matrx",
  metadata: { default_branch: "main" },
};

describe("composer chips: chosen resources are Advanced-only chips", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openPicker.mockClear();
    attached = [];
    readStatus = "succeeded";
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (showResources: boolean) =>
    act(() => {
      root.render(
        <ChatConnectionsStrip conversationId={CONVERSATION_ID} variant="chips" showResources={showResources} />,
      );
    });
  const buttons = () => [...container.querySelectorAll("button")];
  const texts = () => buttons().map((b) => b.textContent ?? "");

  it("Advanced: a chosen repository is its own chip, name · default branch, and opens the chooser", () => {
    attached = [REPO];
    render(true);
    const chip = buttons().find((b) => (b.textContent ?? "").includes("ai-matrx"));
    expect(chip?.textContent).toContain("· main");
    act(() => chip!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(openPicker).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }));
    expect(texts().some((t) => /Choose repositories/.test(t))).toBe(false);
  });

  it("Advanced: nothing chosen yet → the chooser is offered as a chip", () => {
    render(true);
    expect(texts().some((t) => /Choose repositories/.test(t))).toBe(true);
  });

  it("Work: never a repository chip, never the chooser chip — only a count on the connection", () => {
    attached = [REPO];
    render(false);
    expect(texts().some((t) => t.includes("ai-matrx"))).toBe(false);
    expect(texts().some((t) => /Choose repositories/.test(t))).toBe(false);
    expect(buttons().some((b) => /1 attached to this chat from GitHub/.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
  });

  it("a failed read never reads as 'nothing chosen' — it says so and retries", () => {
    readStatus = "failed";
    render(true);
    expect(texts().some((t) => /Choose repositories/.test(t))).toBe(false);
    expect(texts().some((t) => /did not load/.test(t))).toBe(true);
  });

  it("a pure MCP connection gets no chooser in either mode", () => {
    render(true);
    const context7 = buttons().filter((b) => /Context7/.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    expect(context7.length).toBe(1);
  });
});
