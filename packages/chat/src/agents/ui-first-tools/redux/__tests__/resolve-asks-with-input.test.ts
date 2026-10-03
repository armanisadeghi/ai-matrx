/**
 * Guard for the composer-submit path over pending asks.
 *
 * The class this pins (Arman, 2026-09-12): the user answered some questions on
 * the card, then pressed Send in the main chat composer — and the answers they
 * gave were thrown away, every ask resolving as a bare freeform reply. The
 * composer submit must deliver the card answers the user already gave.
 *
 * Exercises the real thunk + the real registries with an in-memory Redux
 * state; the resolvers are the real handler-side promise resolvers.
 */

import { configureStore } from "@reduxjs/toolkit";
import pendingAsksReducer, {
  enqueuePendingAsk,
  selectActivePendingAsksForConversation,
  type PendingAsk,
} from "../pending-asks.slice";
import {
  registerAskResolver,
  __drainForTests,
} from "../ask-resolver-registry";
import { setAskDraft, __clearAllDraftsForTests } from "../ask-draft-registry";
import { resolvePendingAsksWithInput } from "../resolve-asks-with-input.thunk";
import { EMPTY_ASK_RESPONSE, type AskUserResponse } from "../../tools/schemas";
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";

const CONVERSATION = "conv-1";

function makeStore() {
  return configureStore({ reducer: { pendingAsks: pendingAsksReducer } });
}

function ask(callId: string, extra: Partial<PendingAsk> = {}): PendingAsk {
  return {
    callId,
    conversationId: CONVERSATION,
    toolName: "user",
    kind: "text",
    question: `Q ${callId}`,
    status: "pending",
    createdAtMs: Date.now(),
    ...extra,
  };
}

/** Enqueue an ask and capture what its handler-side resolver receives. */
function enqueue(
  store: ReturnType<typeof makeStore>,
  a: PendingAsk,
): { get: () => AskUserResponse | undefined } {
  let received: AskUserResponse | undefined;
  store.dispatch(enqueuePendingAsk(a));
  registerAskResolver(a.callId, (r) => {
    received = r;
  });
  return { get: () => received };
}

function submit(store: ReturnType<typeof makeStore>, text: string): boolean {
  return resolvePendingAsksWithInput(CONVERSATION, text)(
    store.dispatch as unknown as ChatDispatch,
    store.getState as unknown as () => ChatRootState,
  );
}

afterEach(() => {
  __drainForTests();
  __clearAllDraftsForTests();
});

describe("resolvePendingAsksWithInput — card answers survive a composer submit", () => {
  it("delivers the answers the user gave on a batch, the composer text as the note, and skips only the unanswered", () => {
    const store = makeStore();
    const batch = { batchId: "parent", batchTotal: 3 };
    const q0 = enqueue(store, ask("parent.0", { ...batch, batchIndex: 0, kind: "choice" }));
    const q1 = enqueue(store, ask("parent.1", { ...batch, batchIndex: 1 }));
    const q2 = enqueue(store, ask("parent.2", { ...batch, batchIndex: 2 }));

    // The user picked an option on Q1 and typed on Q2; never touched Q3.
    setAskDraft("parent.0", { ...EMPTY_ASK_RESPONSE, selected: ["B"] });
    setAskDraft("parent.1", { ...EMPTY_ASK_RESPONSE, answer: "blue" });

    expect(submit(store, "also make it fast")).toBe(true);

    expect(q0.get()).toEqual({ ...EMPTY_ASK_RESPONSE, selected: ["B"] });
    // The note rides on the last drafted ask of the batch — once, not thrice.
    expect(q1.get()).toEqual({
      ...EMPTY_ASK_RESPONSE,
      answer: "blue",
      additional_instructions: "also make it fast",
    });
    // The untouched question gets the typed text as a freeform reply.
    expect(q2.get()).toEqual({
      ...EMPTY_ASK_RESPONSE,
      wrote_instead: true,
      freeform: "also make it fast",
    });

    const state = store.getState().pendingAsks.byConversationId[CONVERSATION];
    expect(state.map((a) => a.status)).toEqual(["resolved", "resolved", "resolved"]);
  });

  it("with an empty composer, sends drafted answers as-is and cancels only the undrafted", () => {
    const store = makeStore();
    const drafted = enqueue(store, ask("a"));
    const untouched = enqueue(store, ask("b"));
    setAskDraft("a", { ...EMPTY_ASK_RESPONSE, answer: "yes please" });

    expect(submit(store, "   ")).toBe(true);

    expect(drafted.get()).toEqual({ ...EMPTY_ASK_RESPONSE, answer: "yes please" });
    expect(untouched.get()).toEqual({ ...EMPTY_ASK_RESPONSE, cancelled: true });
    const state = store.getState().pendingAsks.byConversationId[CONVERSATION];
    expect(state.find((a) => a.callId === "a")?.status).toBe("resolved");
    expect(state.find((a) => a.callId === "b")?.status).toBe("cancelled");
  });

  it("keeps the pre-existing behaviour when nothing was answered on the cards", () => {
    const store = makeStore();
    const q = enqueue(store, ask("solo"));

    expect(submit(store, "just do it")).toBe(true);
    expect(q.get()).toEqual({
      ...EMPTY_ASK_RESPONSE,
      wrote_instead: true,
      freeform: "just do it",
    });
  });

  it("returns false with no pending asks so the normal turn proceeds", () => {
    const store = makeStore();
    expect(submit(store, "hello")).toBe(false);
  });

  it("clears a draft once its ask resolves so it can never leak into a later ask with the same callId", () => {
    const store = makeStore();
    enqueue(store, ask("reused"));
    setAskDraft("reused", { ...EMPTY_ASK_RESPONSE, answer: "old" });
    expect(submit(store, "")).toBe(true);

    const store2 = makeStore();
    const again = enqueue(store2, ask("reused"));
    expect(submit(store2, "")).toBe(true);
    expect(again.get()).toEqual({ ...EMPTY_ASK_RESPONSE, cancelled: true });
  });
});

describe("a decision card is answered only on its card — a composer message never decides it", () => {
  // Owner proof on /chat 2026-10-03 (conversation 9373b95d): with the canvas
  // edit's approval card open, a follow-up typed in the composer declined the
  // edit ("declined_with_instructions") and the message vanished from the
  // transcript. The message is the person's next message, not their verdict.
  it.each(["approval", "plan_approval", "email_review"] as const)(
    "a pending %s card is left pending and the submit is not consumed",
    (kind) => {
      const store = makeStore();
      const card = enqueue(store, ask("call-card", { kind, toolName: "apply_surface_write" }));
      expect(submit(store, "After that, also tell me the page title.")).toBe(false);
      expect(card.get()).toBeUndefined();
      expect(
        selectActivePendingAsksForConversation(CONVERSATION)(
          store.getState() as unknown as ChatRootState,
        ).map((a) => a.callId),
      ).toEqual(["call-card"]);
    },
  );

  it("a question beside a decision card still takes the composer text; the card stays pending", () => {
    const store = makeStore();
    const question = enqueue(store, ask("call-q"));
    const card = enqueue(store, ask("call-card", { kind: "approval", toolName: "apply_surface_write" }));
    expect(submit(store, "Blue")).toBe(true);
    expect(question.get()).toMatchObject({ wrote_instead: true, freeform: "Blue" });
    expect(card.get()).toBeUndefined();
  });
});
