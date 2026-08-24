import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createRequest } from "../../active-requests/active-requests.slice";
import {
  hydrateMessages,
  type MessageRecord,
} from "../../messages/messages.slice";
import { editMessage } from "../edit-message.thunk";

const rpcReturns = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(() => ({ returns: rpcReturns })),
  },
}));

jest.mock("../invalidate-conversation-cache.thunk", () => ({
  invalidateConversationCache: () => ({ type: "test/invalidate-cache" }),
}));

const CONVERSATION_ID = "conversation-1";
const MESSAGE_ID = "message-1";
const REQUEST_ID = "request-1";

function makeMessage(): MessageRecord {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    agentId: null,
    role: "user",
    content: [{ type: "text", text: "Original answer" }],
    contentHistory: null,
    userContent: null,
    position: 1,
    source: "server",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-08-24T00:00:00.000Z",
    deletedAt: null,
    _clientStatus: "complete",
    _streamRequestId: REQUEST_ID,
  };
}

describe("editMessage retained-stream synchronization", () => {
  test("updates the visible active-request source before the RPC settles", async () => {
    let resolveRpc: ((value: { data: null; error: null }) => void) | undefined;
    rpcReturns.mockImplementationOnce(
      () =>
        new Promise<{ data: null; error: null }>((resolve) => {
          resolveRpc = resolve;
        }),
    );

    const store = configureStore({
      reducer: createSlimRootReducer(),
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(
      hydrateMessages({
        conversationId: CONVERSATION_ID,
        messages: [makeMessage()],
      }),
    );
    store.dispatch(
      createRequest({
        requestId: REQUEST_ID,
        conversationId: CONVERSATION_ID,
      }),
    );

    const pending = store.dispatch(
      editMessage({
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        newContent: [{ type: "text", text: "Edited answer" }],
      }),
    );

    expect(
      store.getState().activeRequests.byRequestId[REQUEST_ID]?.editedText,
    ).toBe("Edited answer");
    expect(
      store.getState().messages.byConversationId[CONVERSATION_ID]?.byId[
        MESSAGE_ID
      ]?.content,
    ).toEqual([{ type: "text", text: "Edited answer" }]);

    resolveRpc?.({ data: null, error: null });
    await pending;
  });
});
