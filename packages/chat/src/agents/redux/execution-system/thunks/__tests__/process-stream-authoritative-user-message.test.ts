import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import messagesReducer, {
  addOptimisticUserMessage,
  promoteMessageId,
  reserveMessage,
  updateMessageRecord,
} from "../../messages/messages.slice";
import { extractFlatText } from "../../messages/messages.selectors";
import { processStream } from "../process-stream";
import { refetchSingleMessage } from "../../message-crud/refetch-single-message.thunk";
import type { RootState } from "@/lib/redux/store";

jest.mock("@/utils/supabase/client", () => {
  const mockQuery = {
    eq: jest.fn(),
    is: jest.fn(),
    maybeSingle: jest.fn(),
  };
  return {
    mockQuery,
    supabase: {
      schema: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => mockQuery),
        })),
      })),
    },
  };
});

const { mockQuery } = jest.requireMock("@/utils/supabase/client") as {
  mockQuery: {
    eq: jest.Mock;
    is: jest.Mock;
    maybeSingle: jest.Mock;
  };
};

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

const encoder = new TextEncoder();
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const WIRE_CONVERSATION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "request-authoritative-user-message";
const USER_MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const ASSISTANT_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

function row(content: unknown[]) {
  return {
    id: USER_MESSAGE_ID,
    conversation_id: CONVERSATION_ID,
    agent_id: null,
    role: "user",
    content,
    content_history: null,
    user_content: null,
    position: 0,
    source: "server",
    status: "active",
    is_visible_to_model: true,
    is_visible_to_user: true,
    metadata: {},
    created_at: "2026-09-19T00:00:00.000Z",
    deleted_at: null,
    tools_on_call: null,
    model_context: null,
    error: null,
    voice: null,
  };
}

function response(events: unknown[]): Response {
  let index = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (index === events.length) return { done: true };
          return {
            done: false,
            value: encoder.encode(JSON.stringify(events[index++]) + "\n"),
          };
        },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
}

test("refreshes a server-assembled user row after its status update without refetching assistant rows", async () => {
  const serverTemplate = "x".repeat(1810);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.is.mockReturnValue(mockQuery);
  const durableRow = {
      id: USER_MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      agent_id: null,
      role: "user",
      content: [{ type: "text", text: serverTemplate }],
      content_history: null,
      user_content: null,
      position: 0,
      source: "server",
      status: "active",
      is_visible_to_model: true,
      is_visible_to_user: true,
      metadata: {},
      created_at: "2026-09-19T00:00:00.000Z",
      deleted_at: null,
      tools_on_call: null,
      model_context: null,
      error: null,
      voice: null,
  };
  // The first terminal read sees the row before its server-composed template;
  // the bounded durable retry must wait for the committed body.
  mockQuery.maybeSingle
    .mockResolvedValueOnce({
      data: { ...durableRow, content: [] },
      error: null,
    })
    .mockResolvedValue({ data: durableRow, error: null });

  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: {
          [CONVERSATION_ID]: { status: "streaming", agentId: null },
        },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (dispatch: (action: unknown) => unknown, getState: () => RootState) => unknown)(
        dispatch,
        getState,
      );
    }
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };

  await processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response: response([
      {
        event: "record_reserved",
        data: {
          db_project: "main",
          table: "message",
          record_id: USER_MESSAGE_ID,
          parent_refs: { conversation_id: WIRE_CONVERSATION_ID },
          metadata: { role: "user", position: 0 },
        },
      },
      {
        event: "record_reserved",
        data: {
          db_project: "main",
          table: "message",
          record_id: ASSISTANT_MESSAGE_ID,
          parent_refs: { conversation_id: WIRE_CONVERSATION_ID },
          metadata: { role: "assistant", position: 1 },
        },
      },
      {
        event: "record_update",
        data: {
          db_project: "main",
          table: "message",
          record_id: USER_MESSAGE_ID,
          status: "completed",
          metadata: {},
        },
      },
      {
        event: "record_update",
        data: {
          db_project: "main",
          table: "message",
          record_id: ASSISTANT_MESSAGE_ID,
          status: "completed",
          metadata: {},
        },
      },
      { event: "end", data: {} },
    ]),
    submitAt: 0,
    conversationIdAt: null,
    dispatch,
    getState,
    forceLocalConversationId: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  const records = messages.byConversationId[CONVERSATION_ID].byId;
  expect(records[USER_MESSAGE_ID]).toMatchObject({
    content: [{ type: "text", text: serverTemplate }],
    userContent: null,
    position: 0,
  });
  expect(records[ASSISTANT_MESSAGE_ID].content).toEqual([]);
  // The assistant's stream-owned body remains untouched by its bookkeeping
  // update. (Other end-of-stream persistence helpers may independently query
  // their own rows through the shared mocked Supabase client.)
  expect(
    mockQuery.eq.mock.calls.filter(
      ([column, value]) => column === "id" && value === USER_MESSAGE_ID,
    ),
  ).toHaveLength(2);
  expect(
    mockQuery.eq.mock.calls.filter(
      ([column, value]) =>
        column === "conversation_id" && value === WIRE_CONVERSATION_ID,
    ),
  ).toHaveLength(2);
  expect(mockQuery.maybeSingle.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test("a frozen optimistic send is not rewritten when the reply's user row completes", async () => {
  mockQuery.eq.mockClear();
  mockQuery.is.mockClear();
  mockQuery.maybeSingle.mockReset();

  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: {
          [CONVERSATION_ID]: { status: "streaming", agentId: null },
        },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (dispatch: (action: unknown) => unknown, getState: () => RootState) => unknown)(
        dispatch,
        getState,
      );
    }
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };

  dispatch(
    addOptimisticUserMessage({
      conversationId: CONVERSATION_ID,
      clientTempId: "temp-user",
      content: [{ type: "text", text: "what I actually sent" }],
      position: 0,
    }),
  );
  dispatch(
    promoteMessageId({
      conversationId: CONVERSATION_ID,
      oldId: "temp-user",
      newId: USER_MESSAGE_ID,
      position: 0,
    }),
  );

  await processStream({
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    response: response([
      {
        event: "record_reserved",
        data: {
          db_project: "main",
          table: "message",
          record_id: USER_MESSAGE_ID,
          parent_refs: { conversation_id: CONVERSATION_ID },
          metadata: { role: "user", position: 0 },
        },
      },
      {
        event: "record_update",
        data: {
          db_project: "main",
          table: "message",
          record_id: USER_MESSAGE_ID,
          status: "completed",
          metadata: {},
        },
      },
      { event: "end", data: {} },
    ]),
    submitAt: 0,
    conversationIdAt: null,
    dispatch,
    getState,
    userMessageClientTempId: USER_MESSAGE_ID,
  });

  const record = messages.byConversationId[CONVERSATION_ID].byId[USER_MESSAGE_ID];
  expect(extractFlatText(record)).toBe("what I actually sent");
  expect(mockQuery.maybeSingle).not.toHaveBeenCalled();
});

test("stream refetch keeps the frozen send when the durable row is a different projection", async () => {
  mockQuery.eq.mockClear();
  mockQuery.is.mockClear();
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.is.mockReturnValue(mockQuery);
  mockQuery.maybeSingle.mockReset().mockResolvedValue({
    data: {
      ...row([{ type: "text", text: "MACHINE TEMPLATE\n\nwhat I actually sent" }]),
      user_content: [{ type: "text", text: "what I actually sent" }],
    },
    error: null,
  });

  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () => ({ messages }) as unknown as RootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (dispatch: (action: unknown) => unknown, getState: () => RootState, extra: unknown) => unknown)(dispatch, getState, undefined);
    }
    messages = messagesReducer(messages, action as never);
    return action;
  };
  dispatch(
    addOptimisticUserMessage({
      conversationId: CONVERSATION_ID,
      clientTempId: USER_MESSAGE_ID,
      content: [{ type: "text", text: "what I actually sent" }],
      position: 0,
    }),
  );

  await dispatch(
    refetchSingleMessage({
      conversationId: CONVERSATION_ID,
      messageId: USER_MESSAGE_ID,
      waitForReadable: true,
    }),
  );

  const record = messages.byConversationId[CONVERSATION_ID].byId[USER_MESSAGE_ID];
  expect(extractFlatText(record)).toBe("what I actually sent");
  expect(record.content).toEqual([{ type: "text", text: "what I actually sent" }]);
});

test("ordinary CRUD refetch accepts an intentional empty content update", async () => {
  mockQuery.eq.mockClear();
  mockQuery.is.mockClear();
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.is.mockReturnValue(mockQuery);
  mockQuery.maybeSingle.mockReset().mockResolvedValue({ data: row([]), error: null });

  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () => ({ messages }) as unknown as RootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (dispatch: (action: unknown) => unknown, getState: () => RootState, extra: unknown) => unknown)(dispatch, getState, undefined);
    }
    messages = messagesReducer(messages, action as never);
    return action;
  };
  dispatch(
    reserveMessage({
      conversationId: CONVERSATION_ID,
      messageId: USER_MESSAGE_ID,
      role: "user",
      position: 0,
    }),
  );
  dispatch(
    updateMessageRecord({
      conversationId: CONVERSATION_ID,
      messageId: USER_MESSAGE_ID,
      patch: { content: [{ type: "text", text: "Old text" }] },
    }),
  );

  await dispatch(refetchSingleMessage({ conversationId: CONVERSATION_ID, messageId: USER_MESSAGE_ID }));
  expect(messages.byConversationId[CONVERSATION_ID].byId[USER_MESSAGE_ID].content).toEqual([]);
  expect(
    mockQuery.eq.mock.calls.filter(([column]) => column === "conversation_id"),
  ).toHaveLength(0);
});

test("terminal host-authored empty row is authoritative without polling", async () => {
  mockQuery.eq.mockClear();
  mockQuery.is.mockClear();
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.is.mockReturnValue(mockQuery);
  mockQuery.maybeSingle.mockReset().mockResolvedValue({
    data: { ...row([]), metadata: { authored_by: "host" } },
    error: null,
  });
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () => ({ messages }) as unknown as RootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (dispatch: (action: unknown) => unknown, getState: () => RootState, extra: unknown) => unknown)(dispatch, getState, undefined);
    }
    messages = messagesReducer(messages, action as never);
    return action;
  };
  dispatch(reserveMessage({ conversationId: CONVERSATION_ID, messageId: USER_MESSAGE_ID, role: "user", position: 0 }));

  await dispatch(refetchSingleMessage({ conversationId: CONVERSATION_ID, messageId: USER_MESSAGE_ID, waitForReadable: true }));
  expect(messages.byConversationId[CONVERSATION_ID].byId[USER_MESSAGE_ID].metadata).toEqual({ authored_by: "host" });
  expect(mockQuery.maybeSingle).toHaveBeenCalledTimes(1);
});
