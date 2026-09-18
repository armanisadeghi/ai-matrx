/**
 * Guard: the rail above the composer carries ONLY this conversation's own
 * connections — never anything account-wide.
 *
 * The wall (census W1, observed live 2026-09-15): inside
 * `/masterwork/vision-interview/<id>` — a room where a subject-matter expert
 * dictates their vision — four chips sat pinned above the message box:
 * "Reducto Public Documentation", "Kestra Public Documentation", "Firecrawl
 * Documentation", "More." Reproduced the same day on the same route as
 * "Fireflies Documentation / Pipedream Documentation / Meta Ads / More".
 *
 * Measured cause: `ChatConnectionsStrip` fell back to `ChatConnectorStrip` —
 * an ACCOUNT-level randomized rotation of the person's live integrations —
 * whenever the conversation had no MCP servers of its own. The interview's
 * role agents carry none, so that room always took the fallback. And since
 * `SmartAgentInput` mounts this strip under EVERY composer on the platform,
 * the leak was every embedded chat surface at once.
 *
 * The SUT is the rail's SCOPE. The test plants a loud account-wide source in
 * the module the fallback used and asserts it never reaches the rail — and,
 * stronger, asserts the whole rail reads as nothing but this chat's own line,
 * so ANY foreign source (not just this one) fails it.
 *
 * Proven failing before passing — against the pre-fix component:
 *   expect(received).toBe(expected)
 *   Expected: "Connectionsnone for this chat"
 *   Received: "ACCOUNT-WIDE: Firecrawl Documentation"
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

jest.mock("@/features/agents/hooks/useMcpTools", () => ({
  useMcpCatalog: () => ({ serverStates: [] }),
}));

jest.mock("@/features/overlays/openers/runControlsWindow", () => ({
  useOpenRunControlsWindow: () => jest.fn(),
}));

jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: () => null,
}));

jest.mock("../RunToolPicker", () => ({ RunToolPicker: () => null }));

// The account-wide source, made unmistakable. If the rail ever reaches for it
// again — by this name or any other — the assertions below fail.
jest.mock("@/features/connectors/ChatConnectorStrip", () => ({
  ChatConnectorStrip: () =>
    React.createElement("div", null, "ACCOUNT-WIDE: Firecrawl Documentation"),
}));

import { ChatConnectionsStrip } from "../ChatConnectionsStrip";

const CONVERSATION_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

describe("ChatConnectionsStrip — scoped to the surface's own conversation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  const render = (conversationId: string | null) =>
    act(() => {
      root.render(
        React.createElement(ChatConnectionsStrip, { conversationId }),
      );
    });

  it("shows this chat's own empty truth, and nothing from the account", () => {
    render(CONVERSATION_ID);

    expect(container.textContent).not.toContain("ACCOUNT-WIDE");
    expect(container.textContent).not.toContain("Firecrawl");
    // Nothing but this conversation's own line — any foreign item fails here.
    expect(container.textContent).toBe("Connectionsnone for this chat");
  });

  it("is absent rather than dead when there is no conversation at all", () => {
    render(null);

    expect(container.textContent).toBe("");
  });
});
