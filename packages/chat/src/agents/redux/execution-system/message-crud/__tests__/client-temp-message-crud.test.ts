/**
 * A client-temp assistant answer (committed when no `cx_message` reservation
 * arrived) has no row the client can name. In an INCOGNITO conversation the
 * server persisted nothing, so deleting removes it locally and it sticks. In a
 * PERSISTED conversation (a reservation gap) the server may hold the answer, so
 * a local-only delete would resurrect on reload: it is refused with a plain
 * reason and the message stays. Editing a client-temp answer is refused. No
 * client-temp id ever reaches an RPC; a durable answer still does.
 *
 * Break caught: a message-crud thunk sending a `client-assistant-req_…` id to
 * `cx_message_soft_delete` / `cx_message_edit` (22P02, a red toast for a
 * message the person could see and act on).
 */

import { configureStore } from "@reduxjs/toolkit";
import { createChatTestReducer } from "../../../../../testing/chat-test-reducer";
import { createInstance } from "../../conversations/conversations.slice";
import {
  hydrateMessages,
  type MessageRecord,
} from "../../messages/messages.slice";
import { deleteMessage } from "../delete-message.thunk";
import { editMessage } from "../edit-message.thunk";
import { mintClientTempId } from "@ai-matrx/kit/ids";

const rpc = jest.fn();

jest.mock("../../../../../host/db", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    schema: jest.fn(() => ({})),
  },
}));

jest.mock("../invalidate-conversation-cache.thunk", () => ({
  invalidateConversationCache: () => ({ type: "test/invalidate-cache" }),
}));

jest.mock("../../thunks/load-conversation.thunk", () => ({
  loadConversation: () => ({ type: "test/load-conversation" }),
}));

const CONVERSATION_ID = "1d89469c-0998-4bb4-b90a-446672519815";
const DURABLE_ID = "0d3372ab-2b54-4f67-b786-20b3cdec9f39";
const CLIENT_TEMP_ID = mintClientTempId(
  "assistant",
  "req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1",
);

function answer(id: string, position: number): MessageRecord {
  return {
    id,
    conversationId: CONVERSATION_ID,
    agentId: null,
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Ask about pain, insurance, and the last X-ray date.",
      },
    ],
    contentHistory: null,
    userContent: null,
    position,
    source: "server",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-10-01T12:25:00.000Z",
    deletedAt: null,
    _clientStatus: "complete",
  };
}

function storeWith(isEphemeral: boolean, ...messages: MessageRecord[]) {
  const store = configureStore({
    reducer: createChatTestReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: "6b6b4e45-4699-4860-8dea-d8a60e07d69a",
      agentType: "user",
      origin: "manual",
      isEphemeral,
    } as never),
  );
  store.dispatch(hydrateMessages({ conversationId: CONVERSATION_ID, messages }));
  return store;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(() => ({
    returns: () => Promise.resolve({ data: DURABLE_ID, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: DURABLE_ID, error: null }),
  }));
});

describe("delete", () => {
  it("removes a client-temp answer in an incognito conversation without calling the database", async () => {
    const store = storeWith(true, answer(DURABLE_ID, 1), answer(CLIENT_TEMP_ID, 2));
    const result = await store.dispatch(
      deleteMessage({ conversationId: CONVERSATION_ID, messageId: CLIENT_TEMP_ID }),
    );
    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(rpc).not.toHaveBeenCalled();
    expect(
      store.getState().messages.byConversationId[CONVERSATION_ID]?.orderedIds,
    ).toEqual([DURABLE_ID]);
  });

  it("refuses a client-temp answer in a persisted conversation and keeps it", async () => {
    const store = storeWith(false, answer(DURABLE_ID, 1), answer(CLIENT_TEMP_ID, 2));
    const result = await store.dispatch(
      deleteMessage({ conversationId: CONVERSATION_ID, messageId: CLIENT_TEMP_ID }),
    );
    expect(result.meta.requestStatus).toBe("rejected");
    expect(result.payload).toEqual({
      message: expect.stringContaining("still saving"),
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(
      store.getState().messages.byConversationId[CONVERSATION_ID]?.orderedIds,
    ).toEqual([DURABLE_ID, CLIENT_TEMP_ID]);
  });

  it("sends a durable answer to the soft-delete RPC", async () => {
    const store = storeWith(false, answer(DURABLE_ID, 1), answer(CLIENT_TEMP_ID, 2));
    await store.dispatch(
      deleteMessage({ conversationId: CONVERSATION_ID, messageId: DURABLE_ID }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "cx_message_soft_delete",
      expect.objectContaining({ p_message_id: DURABLE_ID }),
    );
  });
});

describe("edit", () => {
  it("refuses a client-temp answer without calling the database", async () => {
    const store = storeWith(false, answer(CLIENT_TEMP_ID, 2));
    const result = await store.dispatch(
      editMessage({
        conversationId: CONVERSATION_ID,
        messageId: CLIENT_TEMP_ID,
        newContent: [{ type: "text", text: "Ask about pain first." }],
      } as never),
    );
    expect(result.meta.requestStatus).toBe("rejected");
    expect(rpc).not.toHaveBeenCalled();
  });
});
