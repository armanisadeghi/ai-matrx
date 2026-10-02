/**
 * Stop gives the person's queued messages back (PB-05 W-48, 2026-10-01).
 *
 * Dry run (conversation e2acdae2…): the coordinator queued "Also confirm the
 * wine fridge for the Whitcombes travels upright." then pressed Stop. The card
 * kept saying "Queued — sends when the agent finishes" with nothing running —
 * no run would ever reach the final boundary that delivers it.
 *
 * Breaks guarded: a queued line left stranded after Stop; a line moved to the
 * composer although the run already picked it up (409); the existing draft
 * overwritten; a collaboration note (the agent's, not the person's) taken.
 * The double replaces only the network call (`callApi`).
 */
import {
  configureStore,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../../store/root-state";
import inboxReducer, { addInboxItem, type ConversationInboxItem } from "../inbox.slice";
import instanceUserInputReducer, {
  setUserInputText,
} from "../../instance-user-input/instance-user-input.slice";

const CONV = "e2acdae2-eb77-4c99-9511-f3d591d4841c";
const deleteOutcome = new Map<string, number>(); // injection id → HTTP status

jest.mock("../../../../../host/server/call-api", () => ({
  callApi: (args: { pathParams: { injection_id: string } }) => async () => {
    const status = deleteOutcome.get(args.pathParams.injection_id) ?? 200;
    return status === 200
      ? { data: { injection_id: args.pathParams.injection_id, status: "cancelled" } }
      : { error: { status, message: "already drained" } };
  },
}));
jest.mock("../../../../../host/notify", () => ({ toast: { info: jest.fn(), error: jest.fn() } }));

import { returnQueuedToComposer } from "../inbox.thunks";

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
    queuedAt: "2026-10-01T09:31:01.000Z",
    source: "user",
    ...extra,
  };
}

function store(draft: string) {
  const s = configureStore({
    reducer: { conversationInbox: inboxReducer, instanceUserInput: instanceUserInputReducer },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
  if (draft) s.dispatch(setUserInputText({ conversationId: CONV, text: draft }));
  return s;
}

// The store holds only the two slices this thunk reads; type its dispatch
// as the app's thunk dispatch so the RootState-typed thunk can be driven.
const run = (s: ReturnType<typeof store>) =>
  (s.dispatch as ThunkDispatch<ChatRootState, unknown, UnknownAction>)(
    returnQueuedToComposer({ conversationId: CONV }),
  ).unwrap();

const composer = (s: ReturnType<typeof store>) =>
  s.getState().instanceUserInput.byConversationId[CONV]?.text ?? "";
const cards = (s: ReturnType<typeof store>) =>
  (s.getState().conversationInbox.byConversationId[CONV] ?? []).map((i) => i.text);

beforeEach(() => deleteOutcome.clear());

describe("Stop returns the queue to the composer", () => {
  it("moves each withdrawn line into an empty composer, in order", async () => {
    const s = store("");
    s.dispatch(addInboxItem(item("9a1f0c3e-1", "Also confirm the wine fridge for the Whitcombes travels upright.")));
    s.dispatch(addInboxItem(item("9a1f0c3e-2", "And book the shuttle truck for the Boise drop.")));
    const moved = await run(s);
    expect(moved).toBe(2);
    expect(composer(s)).toBe(
      "Also confirm the wine fridge for the Whitcombes travels upright.\n\nAnd book the shuttle truck for the Boise drop.",
    );
    expect(cards(s)).toEqual([]);
  });

  it("keeps the draft first and leaves a line the run already took", async () => {
    deleteOutcome.set("9a1f0c3e-2", 409);
    const s = store("Whitcombe crew lead is Dana.");
    s.dispatch(addInboxItem(item("9a1f0c3e-1", "Also confirm the wine fridge for the Whitcombes travels upright.")));
    s.dispatch(addInboxItem(item("9a1f0c3e-2", "And book the shuttle truck for the Boise drop.")));
    await run(s);
    expect(composer(s)).toBe(
      "Whitcombe crew lead is Dana.\n\nAlso confirm the wine fridge for the Whitcombes travels upright.",
    );
  });

  it("never takes a collaboration note", async () => {
    const s = store("");
    s.dispatch(
      addInboxItem(
        item("9a1f0c3e-3", "[Collaboration note] Agent 'Lane Planner' — Boise lane is clear", {
          source: "agent_collab",
          kind: "system_message",
        }),
      ),
    );
    const moved = await run(s);
    expect(moved).toBe(0);
    expect(composer(s)).toBe("");
    expect(cards(s)).toHaveLength(1);
  });
});
