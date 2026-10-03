/**
 * A RELOAD DURING AN APPROVAL PAUSE KEEPS THE RUN PAUSED.
 *
 * Live, a turn that stops on an approval card (a canvas edit) is `paused`, and
 * a message typed then is QUEUED into the held run (`smartExecute` routes on
 * `selectIsAwaitingTools`, e84b9bb13d). After a reload the conversation is
 * hydrated as "ready"; the reconnect found the server's `waiting_input`
 * operation and stamped the banner, but never restored `paused` — so the next
 * message read the run as idle and started a FRESH turn beside the held one
 * instead of waiting for the card.
 *
 * RED before the fix: the status stays "ready" and `selectIsAwaitingTools` is
 * false after the cold-load reconnect.
 */

jest.mock("../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("../../redux/execution-system/thunks/resolve-base-url", () => ({
  resolveBackendForConversation: () => "https://server.test",
}));
const pendingCalls = { count: 1 };
jest.mock("../../redux/execution-system/thunks/surface-cold-pending-calls.thunk", () => ({
  surfaceColdPendingCalls: () => async () => pendingCalls.count,
}));
jest.mock("../../ui-first-tools/redux/pending-asks.slice", () => ({
  selectActivePendingAsksForConversation: () => () => [],
}));
jest.mock("../parked-on-person", () => ({ countOpenAsksForConversation: async () => 1 }));
const operation = {
  execution_id: "exec-1",
  request_id: "5ece0e81-6212-4909-aaec-99da75c72b19",
  type: "chat",
  status: "waiting_input",
  is_terminal: false,
  waiting_input: true,
  cost: 0,
  meters: {},
  link_kind: "conversation",
  link_id: "conv-1",
  error: null,
  created_at: null,
  started_at: null,
  ended_at: null,
  last_event_seq: 3,
  events_path: "",
  stream_path: "",
};
jest.mock("../api", () => ({
  fetchOperationsByLink: async () => ({
    link_kind: "conversation",
    link_id: "conv-1",
    operation_count: 1,
    operations: [operation],
  }),
  // The held run stays held for the length of the test.
  followOperationStream: () => new Promise(() => undefined),
}));

import { configureStore } from "@reduxjs/toolkit";
import conversationsReducer, {
  createInstance,
  setInstanceStatus,
} from "../../redux/execution-system/conversations/conversations.slice";
import { selectIsAwaitingTools } from "../../redux/execution-system/selectors/aggregate.selectors";
import { reconnectServerOperation } from "../reconnect-server-operation.thunk";
import type { ChatDispatch, ChatRootState } from "../../../store/root-state";

const CONV = "conv-1";

function reloadedStore(status: "ready" | "cancelled" = "ready") {
  const s = configureStore({
    reducer: {
      conversations: conversationsReducer,
      activeRequests: (state = { byRequestId: {} }) => state,
    },
  });
  s.dispatch(createInstance({ conversationId: CONV, agentId: "agent-1", agentType: "user", origin: "manual", sourceFeature: "chat" }));
  // What the hydrate after a reload leaves: an idle-looking conversation.
  s.dispatch(setInstanceStatus({ conversationId: CONV, status }));
  return s;
}

async function coldLoad(s: ReturnType<typeof reloadedStore>) {
  void (s.dispatch as unknown as ChatDispatch)(reconnectServerOperation({ conversationId: CONV, source: "cold-load" }));
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const state = (s: ReturnType<typeof reloadedStore>) => s.getState() as unknown as ChatRootState;

describe("a reload during an approval pause", () => {
  it("restores the paused status, so the next message queues behind the card", async () => {
    pendingCalls.count = 1;
    const s = reloadedStore();
    expect(selectIsAwaitingTools(CONV)(state(s))).toBe(false);
    await coldLoad(s);
    expect(state(s).conversations.byConversationId[CONV]?.serverOperation?.waitingInput).toBe(true);
    expect(state(s).conversations.byConversationId[CONV]?.status).toBe("paused");
    expect(selectIsAwaitingTools(CONV)(state(s))).toBe(true);
  });

  it("a turn parked on a person (no pending call) is paused too", async () => {
    pendingCalls.count = 0;
    const s = reloadedStore();
    await coldLoad(s);
    expect(state(s).conversations.byConversationId[CONV]?.serverOperation?.recoveryState).toBe("waiting_on_person");
    expect(state(s).conversations.byConversationId[CONV]?.status).toBe("paused");
  });

  it("a Stop the person already pressed is never overwritten", async () => {
    pendingCalls.count = 1;
    const s = reloadedStore("cancelled");
    await coldLoad(s);
    expect(state(s).conversations.byConversationId[CONV]?.status).toBe("cancelled");
  });
});
