/**
 * Guard: an empty transcript is either genuinely empty or HONEST about why.
 *
 * The defect (owner, 2026-09-13): reloading a bound chat sometimes rendered a
 * thread with no messages at all — just the context chip and the composer —
 * because a bundle read that came back with nothing was treated as a fulfilled
 * load. An empty room is a claim about the database ("you never said anything
 * here"); when the read failed, that claim is a lie, and law 4 says a screen is
 * absent or honest, never dead or lying.
 *
 * The SUT is `AgentConversationDisplay`'s decision about WHICH empty state to
 * show, and the retry it hands the user. The transcript's leaf renderers are
 * dependencies and are stubbed; the store, its reducer and the recorded
 * failure are real.
 *
 * Proven failing before passing: with the honest state absent, case 1 failed
 * with "the read-failed notice is missing" (verbatim in the fix commit's
 * report) while case 2 already passed — so neither case alone carries it.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import messages, {
  setMessagesHydrationFailure,
} from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { AgentConversationDisplay } from "./AgentConversationDisplay";

jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-conversation.thunk",
  () => ({
    loadConversation: jest.fn((args: { conversationId: string }) => ({
      type: "test/loadConversation",
      payload: args,
    })),
  }),
);

// The two leaves of the empty branch. Neither owns the decision under test.
jest.mock("./assistant/AgentEmptyMessageDisplay", () => ({
  AgentEmptyMessageDisplay: () => <div />,
}));

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeStore() {
  return configureStore({ reducer: { messages, conversations } });
}

describe("AgentConversationDisplay — an empty transcript never lies", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.mocked(loadConversation).mockClear();
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
  });

  const render = () =>
    act(() => {
      root.render(
        <Provider store={store}>
          <AgentConversationDisplay
            conversationId={CONVERSATION_ID}
            surfaceKey="test-surface"
          />
        </Provider>,
      );
    });

  const retryButton = () =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Try again"),
    );

  it("says the read failed, and offers a retry, when a load left a failure behind", () => {
    act(() => {
      store.dispatch(
        setMessagesHydrationFailure({
          conversationId: CONVERSATION_ID,
          failure: "your sign-in lost access to it",
        }),
      );
    });
    render();

    expect(container.textContent).toContain("Couldn't load");
    // The reason the read gave, verbatim — never reinterpreted.
    expect(container.textContent).toContain("your sign-in lost access to it");

    const button = retryButton();
    expect(button).toBeDefined();
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(jest.mocked(loadConversation)).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID }),
    );
  });

  it("stays quiet for a conversation that is genuinely empty", () => {
    render();

    expect(container.textContent).not.toContain("Couldn't load");
    expect(retryButton()).toBeUndefined();
    expect(jest.mocked(loadConversation)).not.toHaveBeenCalled();
  });
});
