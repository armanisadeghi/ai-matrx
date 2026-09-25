/**
 * Guard: the `inline` display mode's "Agent Result" card shows the run, is
 * honest when it has none, and always closes.
 *
 * The defect (reported live 2026-09-25, /notes → right-click → "Clean up
 * webpage content", a shortcut stored with display_mode = "inline"): the card
 * opened, stayed EMPTY while the server streamed and saved the answer, and
 * would not go away. Root cause was the shell, not the mandate launch path:
 * `AgentRunner` has no intrinsic height (its transcript and composer are
 * absolutely positioned inside `relative h-full`), and this shell gave it only
 * `max-h-[60dvh]`, so the runner collapsed to 0px — measured live: the card's
 * bounding box was 600×35, header only, while the transcript was in the DOM.
 *
 * SUT: `AgentInlineOverlay`. The store, its conversations/messages reducers and
 * the binding decision are real; `AgentRunner` (a dependency whose own
 * behavior is not under test) is stubbed to a marker.
 *
 * jsdom performs no layout, so "the runner has room" is asserted on the one
 * thing that decides it: the shell carries a DEFINITE height (`h-…`), not only
 * a `max-h-…` ceiling. The live proof is the browser run in the fix report.
 *
 * Proven failing before passing: against the pre-fix shell, cases 1, 2, 3 and
 * 4 each fail (no definite height; no alert, the empty runner renders instead;
 * Escape does nothing; the shell inherits a body `pointer-events: none` lock).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import messages from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations, {
  createInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { AgentInlineOverlay } from "./AgentInlineOverlay";

jest.mock("../smart/AgentRunner", () => ({
  AgentRunner: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="agent-runner" data-conversation-id={conversationId} />
  ),
}));

const CONVERSATION_ID = "11111111-2222-3333-4444-555555555555";

function makeStore() {
  return configureStore({
    reducer: {
      messages,
      conversations,
      // Read by the title selector only for an agent-named fallback.
      agentDefinition: (s: { agents: Record<string, unknown> } = { agents: {} }) => s,
    },
  });
}

describe("AgentInlineOverlay — the inline result card shows the run, is honest, and closes", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    store = makeStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.pointerEvents = "";
    errorSpy.mockRestore();
  });

  const render = (conversationId: string, onClose = jest.fn()) => {
    act(() => {
      root.render(
        <Provider store={store}>
          <AgentInlineOverlay conversationId={conversationId} onClose={onClose} />
        </Provider>,
      );
    });
    return onClose;
  };

  const seedConversation = () =>
    act(() => {
      store.dispatch(
        createInstance({
          conversationId: CONVERSATION_ID,
          agentId: "agent-1",
          agentType: "user",
          origin: "shortcut",
          mandateKey: "shortcut.clean_up_webpage_content",
        } as Parameters<typeof createInstance>[0]),
      );
    });

  const shell = () =>
    container.querySelector<HTMLElement>('[data-testid="agent-inline-overlay"]') ??
    // pre-fix shell had no test id — find it by its header text
    (Array.from(container.querySelectorAll<HTMLElement>("div.fixed"))[0] ?? null);

  it("1. a bound run gets a runner with a DEFINITE height (not just a max-h ceiling)", () => {
    seedConversation();
    render(CONVERSATION_ID);

    const runner = container.querySelector('[data-testid="agent-runner"]');
    expect(runner?.getAttribute("data-conversation-id")).toBe(CONVERSATION_ID);

    const classes = (shell()?.className ?? "").split(/\s+/);
    const definiteHeight = classes.filter((c) => /^h-/.test(c));
    expect(definiteHeight).not.toEqual([]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("2. an unbound card says so in words instead of rendering an empty runner", () => {
    render(""); // the OverlayController's sentinel for "no conversationId in data"
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("not connected to a run");
    expect(container.querySelector('[data-testid="agent-runner"]')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    act(() => root.render(<></>));
    render("99999999-9999-9999-9999-999999999999"); // a conversation that does not exist
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "not connected to a run",
    );
  });

  it("3. Escape closes the card, and the X closes it", () => {
    seedConversation();
    const onClose = render(CONVERSATION_ID);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close agent result"]',
    );
    expect(close).not.toBeNull();
    act(() => close!.click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("4. the card re-enables pointer events for itself when a Radix layer left <body> locked", () => {
    // The launching context menu is a Radix modal layer; it sets
    // `pointer-events: none` on <body>. A shell that is not a Radix layer
    // inherits it, and its X becomes dead to the mouse.
    document.body.style.pointerEvents = "none";
    seedConversation();
    render(CONVERSATION_ID);
    expect((shell()?.className ?? "").split(/\s+/)).toContain("pointer-events-auto");
  });
});
