/**
 * Guard: Escape — or a click outside — never silently destroys an unsent
 * composer draft.
 *
 * The defect (real-test run on main 1e91ed8b3b, 2026-10-02, /notes → right-click
 * → AI Actions → a shortcut in the side-drawer display mode): the person typed
 * in the drawer's composer and attached a file and a note. The note picker
 * closed itself; the person pressed Escape to dismiss what they thought was
 * still open — and Escape closed the WHOLE drawer (`FloatingSheet closeOnEsc`),
 * discarding the typed text and both attachments. Reopening started empty.
 *
 * The rule every composer-holding shell now follows (Slack / Linear / ChatGPT:
 * an unsent draft is never thrown away by a stray key):
 *   - composer holds unsent text or an unsent attachment → Escape is consumed
 *     and the shell stays open (the X still closes — an explicit act);
 *   - composer empty → Escape closes, exactly as before.
 *
 * SUT: each conversation shell that closes on Escape — the side drawer, the
 * side panel, the full and compact modals, and the inline result card. The
 * store and the composer's own reducers (text + attachments) are real; the
 * draft is written through the same actions the composer dispatches.
 * `AgentRunner` (whose rendering is not under test) is stubbed to a marker, and
 * the URL-address hook (router-bound) is stubbed out.
 *
 * The same rule covers the other accidental door, a click on the backdrop /
 * outside the shell (side drawer, side panel, full and compact modals; the
 * inline card has no backdrop).
 *
 * Proven failing before passing: against the pre-fix shells every "keeps"
 * case fails (onClose fires on Escape / on the outside click); the "empty
 * closes" cases pass on both.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import messages from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import conversations, {
  createInstance,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import instanceUserInput, {
  setUserInputText,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import instanceResources, {
  addResource,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.slice";

import { AgentSidebarOverlay } from "@ai-matrx/chat/agents/components/agent-widgets/AgentSidebarOverlay";
import { AgentPanelOverlay } from "@ai-matrx/chat/agents/components/agent-widgets/AgentPanelOverlay";
import { AgentFullModal } from "@ai-matrx/chat/agents/components/agent-widgets/AgentFullModal";
import { AgentCompactModal } from "@ai-matrx/chat/agents/components/agent-widgets/AgentCompactModal";
import { AgentInlineOverlay } from "@ai-matrx/chat/agents/components/agent-widgets/AgentInlineOverlay";

jest.mock("@ai-matrx/chat/agents/components/smart/AgentRunner", () => ({
  AgentRunner: ({ conversationId }: { conversationId: string }) => (
    <textarea data-testid="agent-runner" data-conversation-id={conversationId} />
  ),
}));

jest.mock("@ai-matrx/chat/agents/components/agent-widgets/useAgentShellAddress", () => ({
  useAgentShellAddress: () => undefined,
}));

const CONVERSATION_ID = "11111111-2222-3333-4444-555555555555";

function makeStore() {
  return configureStore({
    reducer: {
      messages,
      conversations,
      instanceUserInput,
      instanceResources,
      agentDefinition: (s: { agents: Record<string, unknown> } = { agents: {} }) => s,
    },
  });
}

type Shell = React.ComponentType<{ conversationId: string; onClose: () => void }>;

/** [name, shell, has a backdrop / outside-click dismissal, is a FloatingSheet] */
const SHELLS: Array<[string, Shell, boolean, boolean]> = [
  ["side drawer (sidebar)", AgentSidebarOverlay, true, true],
  ["side panel (panel)", AgentPanelOverlay, true, true],
  ["full modal (modal-full)", AgentFullModal, true, false],
  ["compact modal (modal-compact)", AgentCompactModal, true, false],
  ["inline result card (inline)", AgentInlineOverlay, false, false],
];

describe.each(SHELLS)("%s — a stray key or click never discards an unsent draft", (_name, ShellComponent, hasBackdrop, isSheet) => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    store = makeStore();
    act(() => {
      store.dispatch(
        createInstance({
          conversationId: CONVERSATION_ID,
          agentId: "agent-1",
          agentType: "user",
          origin: "shortcut",
        } as Parameters<typeof createInstance>[0]),
      );
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
    document.body.style.pointerEvents = "";
    jest.restoreAllMocks();
  });

  const render = () => {
    const onClose = jest.fn();
    act(() => {
      root.render(
        <Provider store={store}>
          <ShellComponent conversationId={CONVERSATION_ID} onClose={onClose} />
        </Provider>,
      );
    });
    return onClose;
  };

  // The key reaches the shell the way a real press does: from the focused
  // element (or <body>), bubbling to document and window.
  const pressEscape = () =>
    act(() => {
      const target = (document.activeElement as HTMLElement | null) ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

  // A click outside the shell, the way a real one lands: the FloatingSheet
  // backdrop, or a pointerdown outside a Radix dialog's content (Radix arms
  // its outside listener a tick after mount).
  const clickOutside = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      const backdrop = document.querySelector<HTMLElement>(
        '[data-testid="floating-sheet-backdrop"]',
      );
      if (backdrop) {
        backdrop.click();
        return;
      }
      const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
      Object.defineProperty(down, "pointerType", { value: "mouse" });
      document.body.dispatchEvent(down);
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });
  };

  const seedText = () =>
    act(() => {
      store.dispatch(
        setUserInputText({ conversationId: CONVERSATION_ID, text: "Summarize this for the team" }),
      );
    });

  const seedAttachment = () =>
    act(() => {
      store.dispatch(
        addResource({
          conversationId: CONVERSATION_ID,
          blockType: "input_notes",
          source: { id: "note-1", title: "Q3 planning" },
        }),
      );
    });

  (hasBackdrop ? it : it.skip)("keeps the shell open on an outside click while text is unsent", async () => {
    seedText();
    const onClose = render();
    await clickOutside();
    expect(onClose).not.toHaveBeenCalled();
  });

  (hasBackdrop ? it : it.skip)("keeps the shell open on an outside click while only an attachment is unsent", async () => {
    seedAttachment();
    const onClose = render();
    await clickOutside();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Empty composer: unchanged. The sheets close on a backdrop click; the
  // design-system Dialog (full + compact modals) is windowed by default and
  // never dismisses on an outside click at all, so it stays open either way.
  (hasBackdrop ? it : it.skip)("an outside click on an empty composer behaves as before", async () => {
    const onClose = render();
    await clickOutside();
    expect(onClose).toHaveBeenCalledTimes(isSheet ? 1 : 0);
  });

  it("keeps the shell open when the composer holds unsent text", () => {
    act(() => {
      store.dispatch(
        setUserInputText({ conversationId: CONVERSATION_ID, text: "Summarize this for the team" }),
      );
    });
    const onClose = render();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the shell open when the composer holds only an unsent attachment", () => {
    act(() => {
      store.dispatch(
        addResource({
          conversationId: CONVERSATION_ID,
          blockType: "input_notes",
          source: { id: "note-1", title: "Q3 planning" },
        }),
      );
    });
    const onClose = render();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes on Escape when the composer is empty", () => {
    const onClose = render();
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
