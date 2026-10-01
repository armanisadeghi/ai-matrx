/**
 * A client-temp assistant answer (committed when no `cx_message` reservation
 * arrived — every incognito turn) has no database row. Deleting it removes it
 * from the transcript and calls NO RPC; editing it is refused with an honest
 * reason and calls NO RPC. A durable answer still goes to the RPC.
 *
 * Break caught: a message-crud thunk sending a `client-assistant-req_…` id to
 * `cx_message_soft_delete` / `cx_message_edit` (22P02, a red toast for a
 * message the person could see and act on).
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  hydrateMessages,
  type MessageRecord,
} from "../../messages/messages.slice";
import { deleteMessage } from "../delete-message.thunk";
import { editMessage } from "../edit-message.thunk";
import { mintClientTempId } from "@/lib/ids/durable-record-id";

const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
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

function storeWith(...messages: MessageRecord[]) {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
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
  it("removes a client-temp answer locally without calling the database", async () => {
    const store = storeWith(answer(DURABLE_ID, 1), answer(CLIENT_TEMP_ID, 2));
    const result = await store.dispatch(
      deleteMessage({ conversationId: CONVERSATION_ID, messageId: CLIENT_TEMP_ID }),
    );
    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(rpc).not.toHaveBeenCalled();
    expect(
      store.getState().messages.byConversationId[CONVERSATION_ID]?.orderedIds,
    ).toEqual([DURABLE_ID]);
  });

  it("sends a durable answer to the soft-delete RPC", async () => {
    const store = storeWith(answer(DURABLE_ID, 1), answer(CLIENT_TEMP_ID, 2));
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
    const store = storeWith(answer(CLIENT_TEMP_ID, 2));
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
