/**
 * REGRESSION GUARDS for the "my message doesn't show" class (2026-09-18).
 *
 * 1. `nextTranscriptPosition` derives the next server position from the
 *    loaded rows' positions, never from their count. The run and chat routes
 *    hydrate only the last 12 rows; guessing from the count put the new user
 *    row at position 12 in a 40-row conversation, which sorted it ABOVE the
 *    oldest loaded row — the sent message rendered at the top of the history,
 *    out of view.
 * 2. `hydrateMessages` carries a client-pending optimistic row across a DB
 *    snapshot that does not hold it yet (reconnect / resume / cold-load all
 *    re-read the bundle mid-turn), and keeps the live stream anchors on rows
 *    the DB already knows.
 * 3. The transcript journal records the writes so the admin report can name
 *    what happened.
 */

import { configureStore } from "@reduxjs/toolkit";
import messagesReducer, {
  addOptimisticUserMessage,
  hydrateMessages,
  nextTranscriptPosition,
  promoteMessageId,
  reserveMessage,
  type MessageRecord,
} from "../messages.slice";
import { selectNextMessagePosition } from "../messages.selectors";
import {
  clearTranscriptJournal,
  readTranscriptJournal,
} from "../transcript-journal";
import type { RootState } from "@/lib/redux/store";

const CONV = "conv-window";

function makeStore() {
  return configureStore({
    reducer: { messages: messagesReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function dbRow(
  id: string,
  role: MessageRecord["role"],
  position: number,
  createdAt = "2026-09-18T10:00:00.000Z",
): MessageRecord {
  return {
    id,
    conversationId: CONV,
    agentId: null,
    role,
    content: [{ type: "text", text: `${role} ${position}` }],
    contentHistory: null,
    userContent: null,
    position,
    source: "user",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt,
    deletedAt: null,
  };
}

/** A 40-row conversation of which only the last 12 (positions 28..39) are loaded. */
function windowedHistory(): MessageRecord[] {
  const rows: MessageRecord[] = [];
  for (let p = 28; p < 40; p++) {
    rows.push(dbRow(`m${p}`, p % 2 === 0 ? "user" : "assistant", p));
  }
  return rows;
}

beforeEach(() => clearTranscriptJournal());

describe("nextTranscriptPosition", () => {
  test("is max(position)+1 over the loaded window, not the row count", () => {
    const store = makeStore();
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: windowedHistory(),
        pagination: { oldestPosition: 28, hasMoreOlder: true },
      }),
    );
    const entry = store.getState().messages.byConversationId[CONV];
    expect(entry.orderedIds).toHaveLength(12);
    // The old rule (count) said 12. The server will assign 40.
    expect(nextTranscriptPosition(entry)).toBe(40);
    expect(
      selectNextMessagePosition(CONV)(
        store.getState() as unknown as RootState,
      ),
    ).toBe(40);
  });

  test("is 0 for an empty or unknown conversation", () => {
    const store = makeStore();
    expect(
      selectNextMessagePosition("nope")(
        store.getState() as unknown as RootState,
      ),
    ).toBe(0);
    expect(nextTranscriptPosition(undefined)).toBe(0);
  });

  test("a user row placed by the position rule lands UNDER the loaded history, not above it", () => {
    const store = makeStore();
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: windowedHistory(),
        pagination: { oldestPosition: 28, hasMoreOlder: true },
      }),
    );
    const entry = store.getState().messages.byConversationId[CONV];
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "temp-user",
        content: [{ type: "text", text: "hello" }],
        position: nextTranscriptPosition(entry),
      }),
    );
    const ids = store.getState().messages.byConversationId[CONV].orderedIds;
    expect(ids[ids.length - 1]).toBe("temp-user");

    // And the OLD guess (the count) is exactly the failure: the row sorts to the top.
    const bad = makeStore();
    bad.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: windowedHistory(),
        pagination: { oldestPosition: 28, hasMoreOlder: true },
      }),
    );
    bad.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "temp-user",
        content: [{ type: "text", text: "hello" }],
        position: bad.getState().messages.byConversationId[CONV].orderedIds
          .length,
      }),
    );
    expect(bad.getState().messages.byConversationId[CONV].orderedIds[0]).toBe(
      "temp-user",
    );
  });
});

describe("hydrateMessages keeps the live turn intact", () => {
  test("carries a client-pending optimistic user row the DB snapshot does not hold yet", () => {
    const store = makeStore();
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: [dbRow("m0", "user", 0), dbRow("m1", "assistant", 1)],
      }),
    );
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "temp-user",
        content: [{ type: "text", text: "second question" }],
        position: 2,
      }),
    );
    // A reconnect re-reads the bundle before the server persisted the row.
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: [dbRow("m0", "user", 0), dbRow("m1", "assistant", 1)],
      }),
    );
    const entry = store.getState().messages.byConversationId[CONV];
    expect(entry.orderedIds).toEqual(["m0", "m1", "temp-user"]);
    expect(entry.byId["temp-user"]._clientStatus).toBe("pending");

    // The promotion still retires the temp id normally afterwards.
    store.dispatch(
      promoteMessageId({
        conversationId: CONV,
        oldId: "temp-user",
        newId: "m2",
        position: 2,
      }),
    );
    expect(store.getState().messages.byConversationId[CONV].orderedIds).toEqual(
      ["m0", "m1", "m2"],
    );
  });

  test("does not resurrect a pending row the DB now holds under its server id", () => {
    const store = makeStore();
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "m2",
        content: [{ type: "text", text: "q" }],
        position: 2,
      }),
    );
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: [dbRow("m2", "user", 2)],
      }),
    );
    const entry = store.getState().messages.byConversationId[CONV];
    expect(entry.orderedIds).toEqual(["m2"]);
    expect(entry.byId.m2._clientStatus).toBe("complete");
  });

  test("keeps the live stream anchor on an assistant row the DB already knows", () => {
    const store = makeStore();
    store.dispatch(
      reserveMessage({
        conversationId: CONV,
        messageId: "a1",
        role: "assistant",
        position: 1,
        requestId: "req-1",
        streamSlotStart: 0,
      }),
    );
    store.dispatch(
      hydrateMessages({
        conversationId: CONV,
        messages: [dbRow("m0", "user", 0), dbRow("a1", "assistant", 1)],
      }),
    );
    const rec = store.getState().messages.byConversationId[CONV].byId.a1;
    expect(rec._streamRequestId).toBe("req-1");
    expect(rec._streamSlotStart).toBe(0);
  });

  test("journals the hydrate with the carried rows", () => {
    const store = makeStore();
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "temp-user",
        content: [{ type: "text", text: "q" }],
        position: 0,
      }),
    );
    store.dispatch(hydrateMessages({ conversationId: CONV, messages: [] }));
    const kinds = readTranscriptJournal(CONV).map((e) => e.kind);
    expect(kinds).toEqual(["optimistic_user_added", "hydrate"]);
    const hydrate = readTranscriptJournal(CONV)[1];
    expect(hydrate.detail.carriedPendingRows).toEqual(["temp-user"]);
    expect(hydrate.detail.droppedRows).toBe(0);
  });
});
