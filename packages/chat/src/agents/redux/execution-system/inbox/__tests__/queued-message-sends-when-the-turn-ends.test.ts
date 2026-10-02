/**
 * A queued message SENDS when the turn ends — even when it reached the server
 * after the run's last chance to drain it (2026-10-01, clone conversation
 * fef0260a…).
 *
 * What happened: on /chat/new the person sent message 1, then message 2 while
 * the reply was still on screen. The server finished the run at 12:32:42.449
 * (its final-boundary drain had already run); the client was still reading the
 * tail of the stream, so message 2 routed to the inbox and landed at
 * 12:32:43.450 — one second too late. The server answered `run_active: false`
 * and holds such a row "until the next run". Nothing started one: the card sat
 * at "Waiting — sends after your next message" forever.
 *
 * Breaks guarded (each makes a case below go red):
 *  - the turn-end reconcile never runs (no middleware, or wrong status)
 *  - the stranded line is sent without withdrawing the server row first (it
 *    would be answered twice)
 *  - a line the server already took (DELETE 409) is sent again
 *  - the person's in-progress draft is overwritten or sent with the line
 *  - a collaboration note (the agent's, not the person's) is sent as theirs
 *  - a run that is live again is pre-empted (the server drains that one)
 *
 * Doubles: the network (`callApi`) and the send thunk's network-bound child
 * (`smartExecute`, recorded with the composer text it would send). The
 * middleware, the reconcile thunk, the inbox and composer slices are real.
 */
import {
  combineReducers,
  configureStore,
  type Middleware,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../../store/root-state";
import inboxReducer, {
  addInboxItem,
  confirmInboxItem,
  type ConversationInboxItem,
} from "../inbox.slice";
import instanceUserInputReducer, {
  setUserInputText,
} from "../../instance-user-input/instance-user-input.slice";
import conversationsReducer, {
  setInstanceStatus,
} from "../../conversations/conversations.slice";

const CONV = "fef0260a-0f27-4ae8-85be-409883eca590";
const MESSAGE_2 =
  "Also, which of those should the hygienist re-ask at the first visit?";

const deleteOutcome = new Map<string, number>(); // injection id → HTTP status
const deleted: string[] = [];
const sent: { conversationId: string; composerText: string }[] = [];
let storeRef: ReturnType<typeof makeStore> | null = null;

jest.mock("../../../../../host/server/call-api", () => ({
  callApi:
    (args: { method: string; pathParams: { injection_id?: string } }) =>
    async () => {
      if (args.method !== "DELETE") return { data: {} };
      const id = args.pathParams.injection_id ?? "";
      deleted.push(id);
      const status = deleteOutcome.get(id) ?? 200;
      return status === 200
        ? { data: { injection_id: id, status: "cancelled" } }
        : { error: { status, message: "already drained" } };
    },
}));
jest.mock("../../../../../host/notify", () => ({
  toast: { info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("../../thunks/smart-execute.thunk", () => ({
  smartExecute: (args: { conversationId: string }) => async () => {
    const text =
      storeRef?.getState().instanceUserInput.byConversationId[
        args.conversationId
      ]?.text ?? "";
    sent.push({ conversationId: args.conversationId, composerText: text });
  },
}));

import { inboxTurnEndMiddleware } from "../inbox-turn-end.middleware";
import { deliverStrandedQueue } from "../deliver-stranded-queue.thunk";

function item(
  injectionId: string,
  text: string,
  extra: Partial<ConversationInboxItem> = {},
): ConversationInboxItem {
  return {
    injectionId,
    conversationId: CONV,
    mode: "queue",
    kind: "user_message",
    text,
    status: "pending",
    isVisibleToUser: true,
    queuedAt: "2026-10-01T12:32:43.450Z",
    source: null,
    ...extra,
  };
}

const reducer = combineReducers({
  conversationInbox: inboxReducer,
  instanceUserInput: instanceUserInputReducer,
  conversations: conversationsReducer,
});

function makeStore(status: "running" | "complete" = "running") {
  const s = configureStore({
    reducer,
    // Only the fields the reconcile reads: this conversation and its status.
    preloadedState: {
      conversations: {
        byConversationId: {
          [CONV]: { conversationId: CONV, status },
        },
      },
    } as unknown as ReturnType<typeof reducer>,
    middleware: (g) =>
      g({ serializableCheck: false, immutableCheck: false }).concat(
        // Typed against the app's RootState; this store holds the three
        // slices it reads.
        inboxTurnEndMiddleware as Middleware,
      ),
  });
  storeRef = s;
  return s;
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};
const composer = (s: ReturnType<typeof makeStore>) =>
  s.getState().instanceUserInput.byConversationId[CONV]?.text ?? "";
const cards = (s: ReturnType<typeof makeStore>) =>
  (s.getState().conversationInbox.byConversationId[CONV] ?? []).map(
    (i) => i.text,
  );

beforeEach(() => {
  deleteOutcome.clear();
  deleted.length = 0;
  sent.length = 0;
});

describe("a queued message sends when the turn ends", () => {
  it("withdraws the stranded line and sends it as the next turn when the run completes", async () => {
    const s = makeStore("running");
    s.dispatch(addInboxItem(item("f11fc457-e37a", MESSAGE_2)));
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(deleted).toEqual(["f11fc457-e37a"]);
    expect(sent).toEqual([{ conversationId: CONV, composerText: MESSAGE_2 }]);
    expect(cards(s)).toEqual([]);
  });

  it("sends a line whose enqueue was acknowledged after the run had already ended", async () => {
    const s = makeStore("running");
    s.dispatch(
      addInboxItem(item("inbox_local_1", MESSAGE_2, { status: "sending" })),
    );
    // The stream ends while the POST is still in flight — nothing to send yet.
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(sent).toEqual([]);
    // The server acknowledges it (run_active: false) — now it is stranded.
    s.dispatch(
      confirmInboxItem({
        conversationId: CONV,
        localId: "inbox_local_1",
        injectionId: "f11fc457-e37a",
      }),
    );
    await flush();
    expect(deleted).toEqual(["f11fc457-e37a"]);
    expect(sent.map((x) => x.composerText)).toEqual([MESSAGE_2]);
  });

  it("sends only the head; the rest wait for that turn", async () => {
    const s = makeStore("running");
    s.dispatch(addInboxItem(item("q-1", MESSAGE_2)));
    s.dispatch(addInboxItem(item("q-2", "And how long should the call take?")));
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(sent.map((x) => x.composerText)).toEqual([MESSAGE_2]);
    expect(cards(s)).toEqual(["And how long should the call take?"]);
  });

  it("never re-sends a line the server already took (409)", async () => {
    deleteOutcome.set("f11fc457-e37a", 409);
    const s = makeStore("running");
    s.dispatch(addInboxItem(item("f11fc457-e37a", MESSAGE_2)));
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(sent).toEqual([]);
  });

  it("keeps the person's draft: the line goes back in ahead of it, nothing is sent", async () => {
    const s = makeStore("running");
    s.dispatch(
      setUserInputText({ conversationId: CONV, text: "Draft: insurance card" }),
    );
    s.dispatch(addInboxItem(item("f11fc457-e37a", MESSAGE_2)));
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(sent).toEqual([]);
    expect(composer(s)).toBe(`${MESSAGE_2}\n\nDraft: insurance card`);
    expect(cards(s)).toEqual([]);
  });

  it("never sends a collaboration note as the person's message", async () => {
    const s = makeStore("running");
    s.dispatch(
      addInboxItem(
        item("collab-1", "[Collaboration note] Intake Planner — forms ready", {
          source: "agent_collab",
          kind: "system_message",
        }),
      ),
    );
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
    await flush();
    expect(deleted).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("leaves the line to the server when a run is live again", async () => {
    const s = makeStore("running");
    s.dispatch(addInboxItem(item("f11fc457-e37a", MESSAGE_2)));
    await (s.dispatch as ThunkDispatch<ChatRootState, unknown, UnknownAction>)(
      deliverStrandedQueue({ conversationId: CONV }),
    );
    expect(deleted).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("does nothing for a run that errored or was stopped (Stop has its own return path)", async () => {
    const s = makeStore("running");
    s.dispatch(addInboxItem(item("f11fc457-e37a", MESSAGE_2)));
    s.dispatch(setInstanceStatus({ conversationId: CONV, status: "cancelled" }));
    await flush();
    expect(sent).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
