/**
 * Guard: a connection you can CHOOSE things out of never looks like a
 * connection you can only connect to.
 *
 * Arman, 2026-09-15: "You are not differentiating between things that are just
 * purely a connection to an MCP and those that allow us to select something.
 * Google Drive or Sheets: I select it and, while we give the agent the MCP,
 * also let a user choose what they want to attach directly."
 *
 * The wall: every connection in the composer rail wore the identical chip —
 * name plus state. For a pure MCP server that is the whole truth. For GitHub
 * it hid the only act that matters (choose WHICH repositories), so a person
 * who connected GitHub was shown a finished-looking checkmark next to a
 * service that had not been pointed at anything.
 *
 * The SUT is the RENDERING DECISION, driven only by the availability payload:
 * a server whose `attachable` list is non-empty must carry a chooser door
 * named in the provider's own words, and a server whose list is empty must
 * not. No slug is special-cased anywhere in the path under test.
 *
 * Proven failing before passing — against the pre-fix component:
 *   Unable to find a control named /Choose repositories/ on the GitHub chip
 *   (the rail rendered "GitHub" and "Context7" identically).
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

jest.mock("@/features/connectors/useConversationAttachments", () => ({
  useConversationAttachments: () => ({
    items: [],
    status: "succeeded",
    error: null,
    writeError: null,
    busyKeys: [],
    attach: jest.fn(),
    remove: jest.fn(),
    reload: jest.fn(),
  }),
}));

import { ChatConnectionsStrip } from "../ChatConnectionsStrip";

function controlNamesIn(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button, a")].map(
    (node) =>
      node.getAttribute("aria-label") ??
      node.getAttribute("title") ??
      node.textContent ??
      "",
  );
}

describe("attachable connections are visibly different from plain ones", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openPicker.mockClear();
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

  function render() {
    act(() => {
      root.render(
        <ChatConnectionsStrip conversationId={CONVERSATION_ID} />,
      );
    });
  }

  it("gives the attachable connection a chooser door named in the provider's own words", () => {
    render();
    const names = controlNamesIn(container);
    expect(
      names.some((name) => /Choose repositories/i.test(name)),
    ).toBe(true);
  });

  it("gives the pure MCP connection no chooser at all — a dead control is worse than none", () => {
    render();
    const contextSevenControls = controlNamesIn(container).filter((name) =>
      /Context7/i.test(name),
    );
    expect(contextSevenControls.length).toBeGreaterThan(0);
    expect(
      contextSevenControls.some((name) => /Choose/i.test(name)),
    ).toBe(false);
  });

  it("opens the chooser for the right provider when the door is used", () => {
    render();
    const door = [...container.querySelectorAll("button")].find((node) =>
      /Choose repositories/i.test(
        node.getAttribute("aria-label") ?? node.textContent ?? "",
      ),
    );
    expect(door).toBeDefined();
    act(() => {
      door!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github" }),
    );
  });
});
