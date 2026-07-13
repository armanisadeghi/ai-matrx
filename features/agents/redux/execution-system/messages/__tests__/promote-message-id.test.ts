/**
 * REGRESSION GUARD: promoteMessageId under the duplicate-id race (FIX 6).
 *
 * A mid-stream loadConversation can seed byId[newId] from the DB BEFORE the
 * promote lands (the row persists before the stream event announces it).
 * Renaming oldId onto the existing newId used to map BOTH orderedIds slots
 * to newId — duplicate React keys and a doubled bubble. The reducer must
 * MERGE instead: keep the DB-hydrated record, carry the live stream anchor,
 * drop the old id.
 */

import { configureStore } from "@reduxjs/toolkit";
import messagesReducer, {
  reserveMessage,
  promoteMessageId,
  updateMessageRecord,
} from "../messages.slice";

const CONV = "conv-1";

function makeStore() {
  return configureStore({
    reducer: { messages: messagesReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function entry(store: ReturnType<typeof makeStore>) {
  return store.getState().messages.byConversationId[CONV];
}

test("normal promote renames the record and the ordered id", () => {
  const store = makeStore();
  store.dispatch(
    reserveMessage({
      conversationId: CONV,
      messageId: "temp-1",
      role: "assistant",
      position: 3,
      requestId: "req-1",
    }),
  );
  store.dispatch(
    promoteMessageId({
      conversationId: CONV,
      oldId: "temp-1",
      newId: "server-1",
      position: 5,
    }),
  );
  const e = entry(store);
  expect(e.byId["temp-1"]).toBeUndefined();
  expect(e.byId["server-1"]).toMatchObject({ id: "server-1", position: 5 });
  expect(e.orderedIds).toEqual(["server-1"]);
});

test("promote onto an ALREADY-SEEDED id merges: no duplicate ordered ids, anchor carried", () => {
  const store = makeStore();

  // Live stream reserves the placeholder (carries the stream anchor).
  store.dispatch(
    reserveMessage({
      conversationId: CONV,
      messageId: "temp-1",
      role: "assistant",
      position: 3,
      requestId: "req-live",
    }),
  );

  // Mid-stream loadConversation seeds the DURABLE id from the DB first
  // (reserveMessage stands in for the hydration write; no anchor).
  store.dispatch(
    reserveMessage({
      conversationId: CONV,
      messageId: "server-1",
      role: "assistant",
      position: 5,
    }),
  );
  store.dispatch(
    updateMessageRecord({
      conversationId: CONV,
      messageId: "server-1",
      patch: { status: "active", _clientStatus: "complete" },
    }),
  );

  // The promote arrives late.
  store.dispatch(
    promoteMessageId({
      conversationId: CONV,
      oldId: "temp-1",
      newId: "server-1",
      position: 5,
    }),
  );

  const e = entry(store);
  expect(e.byId["temp-1"]).toBeUndefined();
  // No duplicate ids — the old slot is dropped, not renamed onto the target.
  expect(e.orderedIds.filter((id) => id === "server-1")).toHaveLength(1);
  expect(e.orderedIds).not.toContain("temp-1");
  // The live stream anchor survives the merge so the renderer keeps reading
  // the active request.
  expect(e.byId["server-1"]._streamRequestId).toBe("req-live");
});
