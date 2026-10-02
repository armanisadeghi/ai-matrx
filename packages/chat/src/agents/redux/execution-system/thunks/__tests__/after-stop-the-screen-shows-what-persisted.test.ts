/**
 * After Stop, the transcript shows what the server persisted (PB-05 W-47).
 *
 * Dry run 2026-10-01 (conversation e2acdae2…, Compass Itinerary Clerk): the
 * coordinator pressed Stop while the screen showed "Stop 2"; the server
 * finished its in-flight call and saved Stops 1–10 plus a tool call, but the
 * screen stayed at Stop 2 until a reload. A Stop pressed while the run still
 * said "Initializing" (no X-Request-ID yet) sent no server cancel at all.
 *
 * Breaks guarded: the stopped request's rows keep rendering from the frozen
 * stream; the late cancel is never sent; a newer run's screen is clobbered.
 * Doubles replace only what the thunk CALLS: the runtime spine read, the
 * cancel POST, the backend resolver, and the database re-read.
 */
import {
  configureStore,
  createAsyncThunk,
  createSlice,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../../store/root-state";
import messagesReducer, {
  hydrateMessages,
  reserveMessage,
  type MessageRecord,
} from "../../messages/messages.slice";
import type { RuntimeOperationsByLinkResponse } from "../../../../runtime-reconnect/types";
import {
  _resetChatHostForTests,
  configureChat,
} from "../../../../../host/configure";
import type { ChatDiagnosticEntry } from "../../../../../host/contract";
import { createFakeDb } from "../../../../../host/__tests__/fake-db";

// The host's diagnostics port: every entry the package records, in order.
const recorded: ChatDiagnosticEntry[] = [];
const getSnapshot = () => recorded;

const CONV = "e2acdae2-eb77-4c99-9511-f3d591d4841c";
const SERVER_REQ = "4ac2df1c-2085-45f2-ada8-b039e5374d19";
const LOCAL_REQ = "req_whitcombe_local";
const ANSWER_ID = "b7c1e9a4-3f2d-4c8e-9a1b-2d3e4f5a6b7c";
const PERSISTED_ANSWER =
  "Stop 1 — Whitcombe residence, Tacoma WA … Stop 10 — Ellensburg WA truck stop";

const spine: RuntimeOperationsByLinkResponse[] = [];
const fetchOperationsByLink = jest.fn(async () => spine.shift() ?? spine[0] ?? null);
const cancelAgentRunRequest = jest.fn((requestId: string) => async () => ({
  data: { request_id: requestId },
  requestId,
}));

jest.mock("../../../../runtime-reconnect/api", () => ({
  fetchOperationsByLink: (...a: unknown[]) => fetchOperationsByLink(...(a as [])),
}));
jest.mock("@host/lib/api/matrx-transport", () => ({
  cancelAgentRunRequest: (id: string) => cancelAgentRunRequest(id),
}));
jest.mock("../resolve-base-url", () => ({
  resolveBackendForConversation: () => ({
    baseUrl: "https://server.app.matrxserver.com",
    headers: {},
    channel: "global",
  }),
}));
// The database re-read: what chat.message holds after the server settled.
jest.mock("../load-conversation.thunk", () => ({
  loadConversation: createAsyncThunk(
    "conversations/load",
    async ({ conversationId }: { conversationId: string }, { dispatch }) => {
      dispatch(
        hydrateMessages({
          conversationId,
          messages: [
            {
              id: ANSWER_ID,
              conversationId,
              agentId: null,
              role: "assistant",
              content: [{ type: "text", text: PERSISTED_ANSWER }],
              contentHistory: null,
              userContent: null,
              position: 16,
              source: "assistant",
              status: "active",
              isVisibleToModel: true,
              isVisibleToUser: true,
              metadata: {},
              createdAt: "2026-10-01T09:31:05.539Z",
              deletedAt: null,
            } as MessageRecord,
          ],
        }),
      );
    },
  ),
}));

import { settleAfterStop } from "../settle-after-stop.thunk";

function op(requestId: string, status: "running" | "cancelled") {
  return {
    link_kind: "conversation",
    link_id: CONV,
    operation_count: 1,
    operations: [
      {
        execution_id: "db44acc6-d74a-44eb-a38a-808147e11df9",
        request_id: requestId,
        type: "conversation",
        status,
        is_terminal: status !== "running",
        waiting_input: false,
        cost: "0.007621",
        meters: {},
        link_kind: "conversation",
        link_id: CONV,
        error: null,
        created_at: "2026-10-01T09:30:54.673Z",
        started_at: "2026-10-01T09:30:54.673Z",
        ended_at: status === "running" ? null : "2026-10-01T09:31:06.695Z",
        last_event_seq: 40,
        events_path: "",
        stream_path: "",
      },
    ],
  } satisfies RuntimeOperationsByLinkResponse;
}

const SHOWN_AT_STOP =
  "Stop 1 — Whitcombe residence, Tacoma WA\n\nStop 2 — Public Storage, Tacoma WA";

/**
 * PB-05 run 2 (prod ac170b56…): the conversation already held a FINISHED
 * answer from earlier in the session (24b5c145, the 40-stop Halvorsen run).
 * Stop handed every request id of the conversation to the settle, so that
 * finished answer was compared too — 16,639 characters on screen against the
 * 1,900 attributed to it after the re-read — and the Error Inspector reported a
 * stopped answer "saved shorter than it was shown" that was never stopped.
 */
const EARLIER_FINISHED_REQ = "req_halvorsen_finished";
const EARLIER_FINISHED_TEXT =
  "Stop 1 — Halvorsen residence, Portland OR … Stop 40 — Denver CO. Itinerary complete — 40 stops.";

function makeStore(
  status: "cancelled" | "running",
  shown = SHOWN_AT_STOP,
  { withEarlierFinishedAnswer = false } = {},
) {
  const conversations = createSlice({
    name: "conversations",
    initialState: { byConversationId: { [CONV]: { status } } },
    reducers: {},
  });
  // What the stream had rendered for the stopped request when Stop landed.
  const activeRequests = createSlice({
    name: "activeRequests",
    initialState: {
      byRequestId: {
        [LOCAL_REQ]: {
          status: "cancelled",
          renderBlockOrder: ["b0"],
          renderBlocks: { b0: { id: "b0", type: "text", content: shown } },
          editedText: null,
        },
        ...(withEarlierFinishedAnswer
          ? {
              [EARLIER_FINISHED_REQ]: {
                status: "complete",
                renderBlockOrder: ["b0"],
                renderBlocks: {
                  b0: { id: "b0", type: "text", content: EARLIER_FINISHED_TEXT },
                },
                editedText: null,
              },
            }
          : {}),
      },
      byConversationId: {
        [CONV]: withEarlierFinishedAnswer
          ? [EARLIER_FINISHED_REQ, LOCAL_REQ]
          : [LOCAL_REQ],
      },
    },
    reducers: {},
  });
  const store = configureStore({
    reducer: {
      messages: messagesReducer,
      conversations: conversations.reducer,
      activeRequests: activeRequests.reducer,
    },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
  // The row the stream was filling when Stop was pressed (frozen at Stop 2).
  store.dispatch(
    reserveMessage({
      conversationId: CONV,
      messageId: ANSWER_ID,
      role: "assistant",
      position: 16,
      requestId: LOCAL_REQ,
    }),
  );
  return store;
}

// Only the slices the thunk reads exist; drive it with the app's thunk dispatch type.
const settle = (
  store: ReturnType<typeof makeStore>,
  args: Parameters<typeof settleAfterStop>[0],
) =>
  (store.dispatch as ThunkDispatch<ChatRootState, unknown, UnknownAction>)(
    settleAfterStop(args),
  ).unwrap();

function answer(store: ReturnType<typeof makeStore>) {
  const rec = store.getState().messages.byConversationId[CONV].byId[ANSWER_ID];
  const first: unknown = Array.isArray(rec.content) ? rec.content[0] : undefined;
  const text =
    first && typeof first === "object" && "text" in first && typeof first.text === "string"
      ? first.text
      : "";
  return { streamAnchor: rec._streamRequestId ?? null, text };
}

beforeEach(() => {
  recorded.length = 0;
  _resetChatHostForTests();
  configureChat({
    db: createFakeDb().db,
    diagnostics: {
      capture() {},
      record(entry) {
        recorded.push(entry);
        return `diagnostic-${recorded.length}`;
      },
    },
  });
  spine.length = 0;
  fetchOperationsByLink.mockClear();
  cancelAgentRunRequest.mockClear();
});

afterAll(() => _resetChatHostForTests());

describe("after Stop the screen shows what persisted", () => {
  it("follows the cancelled run to its end and renders the saved answer", async () => {
    spine.push(op(SERVER_REQ, "running"), op(SERVER_REQ, "cancelled"));
    const store = makeStore("cancelled");
    const outcome = await settle(store, {
          conversationId: CONV,
          serverRequestId: SERVER_REQ,
          localRequestIds: [LOCAL_REQ],
          pollMs: 1,
        });
    expect(outcome).toBe("reloaded");
    expect(answer(store)).toEqual({ streamAnchor: null, text: PERSISTED_ANSWER });
    expect(cancelAgentRunRequest).not.toHaveBeenCalled();
  });

  it("sends the cancel a Stop pressed during Initializing could not", async () => {
    spine.push(op(SERVER_REQ, "running"), op(SERVER_REQ, "cancelled"));
    const store = makeStore("cancelled");
    await settle(store, {
          conversationId: CONV,
          serverRequestId: null,
          localRequestIds: [LOCAL_REQ],
          pollMs: 1,
        });
    expect(cancelAgentRunRequest.mock.calls).toEqual([[SERVER_REQ]]);
    expect(answer(store).text).toBe(PERSISTED_ANSWER);
  });

  it("leaves a newer run's screen alone", async () => {
    spine.push(op(SERVER_REQ, "cancelled"));
    const store = makeStore("running");
    const outcome = await settle(store, {
          conversationId: CONV,
          serverRequestId: SERVER_REQ,
          localRequestIds: [LOCAL_REQ],
          pollMs: 1,
        });
    expect(outcome).toBe("superseded_by_new_run");
    expect(answer(store)).toEqual({ streamAnchor: LOCAL_REQ, text: "" });
  });
  it("compares only the stopped answer, never an answer that had already finished", async () => {
    spine.push(op(SERVER_REQ, "cancelled"));
    const store = makeStore("cancelled", SHOWN_AT_STOP, {
      withEarlierFinishedAnswer: true,
    });
    await settle(store, {
      conversationId: CONV,
      serverRequestId: SERVER_REQ,
      localRequestIds: [EARLIER_FINISHED_REQ, LOCAL_REQ],
      pollMs: 1,
    });
    expect(getSnapshot()).toEqual([]);
    expect(answer(store)).toEqual({ streamAnchor: null, text: PERSISTED_ANSWER });
  });

  it("keeps what was shown when the save is shorter, and reports the gap", async () => {
    spine.push(op(SERVER_REQ, "cancelled"));
    const longerOnScreen = `${PERSISTED_ANSWER}\n\nStop 11 — Cle Elum WA rest area\n\nStop 12 — Vantage WA fuel`;
    const store = makeStore("cancelled", longerOnScreen);
    await settle(store, {
      conversationId: CONV,
      serverRequestId: SERVER_REQ,
      localRequestIds: [LOCAL_REQ],
      pollMs: 1,
    });
    expect(answer(store).streamAnchor).toBe(LOCAL_REQ);
    expect(getSnapshot().map((e) => e.message)).toEqual([
      "A stopped answer was saved shorter than it was shown",
    ]);
  });
});
