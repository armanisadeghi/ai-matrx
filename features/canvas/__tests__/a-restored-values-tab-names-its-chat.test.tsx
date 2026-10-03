/**
 * A RESTORED "VALUES TO SEND" TAB NEVER PASSES FOR ANOTHER CHAT (2026-10-03).
 *
 * Use case: yesterday the person opened the values tab for "Huddle supply
 * order list"; today, after a reload, the canvas restores it beside a
 * different chat. The tab read just "Values to send" and listed rows computed
 * for a conversation this session never loaded — the first turn's system
 * values a chat with history will never send — so it looked like the values
 * of the chat beside it.
 *
 * Now the tab is bound to the conversation it was opened for and names it
 * ("Transcripts · Huddle supply order list"), and a conversation not loaded
 * this session is loaded before any row shows: no flash of guessed rows.
 *
 * SUT: the real canvas view over a real conversations slice; the panel and
 * the loader are stood in for (the panel's rows are covered elsewhere).
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import conversationsReducer, {
  createInstance,
  setConversationLabel,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";

const mockLoad = jest.fn();
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk", () => ({
  loadConversation: (arg: { conversationId: string }) => {
    mockLoad(arg);
    const thunk = () => ({ unwrap: () => new Promise(() => {}) });
    return thunk;
  },
}));
jest.mock("@ai-matrx/chat/agents/components/context-policies-display/ContextRulesPanel", () => ({
  ContextRulesPanel: ({ conversationId }: { conversationId: string }) => (
    <div data-values-panel={conversationId} />
  ),
}));

import ConversationContextCanvasView from "@/features/canvas/host/conversation/ConversationContextCanvasView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HUDDLE = "a52e453a-e93e-4c79-a80b-239f95986812";

function makeStore(withConversation: boolean) {
  const store = configureStore({ reducer: { conversations: conversationsReducer } });
  if (withConversation) {
    store.dispatch(
      createInstance({ conversationId: HUDDLE, agentId: "a1", agentType: "user", origin: "manual", sourceFeature: "chat" }),
    );
    store.dispatch(setConversationLabel({ conversationId: HUDDLE, title: "Huddle supply order list" }));
  }
  return store;
}

function render(store: ReturnType<typeof makeStore>) {
  const update = jest.fn(async () => undefined);
  const host = document.createElement("div");
  const root = createRoot(host);
  const props = {
    data: { conversationId: HUDDLE, agentId: "a1", title: "Transcripts" },
    item: { id: `conversation-context::${HUDDLE}`, title: "Transcripts" },
    canvas: { update },
    presentation: { isNarrow: false },
  } as unknown as React.ComponentProps<typeof ConversationContextCanvasView>;
  act(() =>
    root.render(
      <Provider store={store}>
        <ConversationContextCanvasView {...props} />
      </Provider>,
    ),
  );
  return { host, update, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => mockLoad.mockReset());

describe("a restored values tab", () => {
  it("shows no rows for a chat this session has not loaded — it loads that chat first", () => {
    const { host, unmount } = render(makeStore(false));
    expect(host.querySelector("[data-values-panel]")).toBeNull();
    expect(host.querySelector('[data-values-tab-state="loading"]')).not.toBeNull();
    expect(mockLoad).toHaveBeenCalledWith({ conversationId: HUDDLE });
    unmount();
  });

  it("names the chat it belongs to once that chat is known", () => {
    const { host, update, unmount } = render(makeStore(true));
    expect(host.querySelector(`[data-values-panel="${HUDDLE}"]`)).not.toBeNull();
    expect(update).toHaveBeenCalledWith(`conversation-context::${HUDDLE}`, {
      title: "Transcripts · Huddle supply order list",
    });
    expect(mockLoad).not.toHaveBeenCalled();
    unmount();
  });
});
