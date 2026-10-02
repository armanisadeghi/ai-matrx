/**
 * Guard: a bundle that comes back with no conversation row is benign ONLY for
 * a conversation this client just minted.
 *
 * The defect (owner, 2026-09-13): `get_cx_conversation_bundle` returns a null
 * conversation both for "the row does not exist yet" and for "you were not
 * allowed to read it" (an RLS denial while the browser session is still
 * hydrating). `loadConversation` treated both as benign, resolved FULFILLED
 * with zero messages, and the chat rendered an empty thread with full chrome.
 *
 * The SUT is that discrimination — which read is benign and which is a failure
 * the user must be told about. The network (supabase, the bundle fetcher, the
 * edit-history thunk) is stubbed; the store, its reducer and the recorded
 * outcome are real.
 */

import { configureStore } from "@reduxjs/toolkit";

import messages from "../../messages/messages.slice";
import conversations from "../../conversations/conversations.slice";
import { CONVERSATION_NOT_MATERIALIZED } from "../conversation-bundle";
import { loadConversation } from "../load-conversation.thunk";

const mockFetchBundle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

jest.mock("../conversation-bundle", () => {
  const actual = jest.requireActual("../conversation-bundle");
  return {
    ...actual,
    fetchConversationBundle: (...args: unknown[]) => mockFetchBundle(...args),
  };
});

jest.mock("@/features/code/redux/codeEditHistoryHydration", () => ({
  loadCodeEditHistoryThunk: () => ({ type: "test/loadCodeEditHistory" }),
}));

const CONVERSATION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function makeStore() {
  return configureStore({ reducer: { messages, conversations } });
}

function notMaterialized() {
  return Object.assign(new Error("conversation unavailable"), {
    code: CONVERSATION_NOT_MATERIALIZED,
  });
}

function failureFor(store: ReturnType<typeof makeStore>) {
  return (
    store.getState().messages.byConversationId[CONVERSATION_ID]
      ?.hydrationFailure ?? null
  );
}

describe("loadConversation — an unreadable conversation is never silent", () => {
  beforeEach(() => {
    mockFetchBundle.mockReset();
  });

  it("records a failure when REOPENING a conversation the server has nothing for", async () => {
    mockFetchBundle.mockRejectedValue(notMaterialized());
    const store = makeStore();

    await store.dispatch(
      loadConversation({
        conversationId: CONVERSATION_ID,
        expectMaterialized: true,
      }) as never,
    );

    expect(failureFor(store)).toEqual(expect.any(String));
  });

  it("stays silent for a conversation this client minted and never submitted", async () => {
    mockFetchBundle.mockRejectedValue(notMaterialized());
    const store = makeStore();

    await store.dispatch(
      loadConversation({ conversationId: CONVERSATION_ID }) as never,
    );

    expect(failureFor(store)).toBeNull();
  });

  it("records the server's own message when the read fails outright", async () => {
    mockFetchBundle.mockRejectedValue(
      new Error("JWT expired while reading the bundle"),
    );
    const store = makeStore();

    await store.dispatch(
      loadConversation({ conversationId: CONVERSATION_ID }) as never,
    );

    expect(failureFor(store)).toBe("JWT expired while reading the bundle");
  });
});
