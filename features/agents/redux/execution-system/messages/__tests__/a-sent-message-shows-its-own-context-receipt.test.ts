/**
 * A SENT MESSAGE SHOWS WHAT THE SERVER DID WITH ITS CONTEXT — its own turn's
 * receipt, never live values and never another turn's receipt
 * (common-docs context-delivery RULES.md §5).
 *
 * Breaks this catches:
 *   - the bundle mapper narrowing `model_context` and dropping `delivery.receipt`
 *     → every reloaded bubble falls back to the client snapshot;
 *   - the selector preferring the live receipt over the persisted one;
 *   - an old (database-loaded) message picking up the conversation's latest
 *     live receipt;
 *   - turn 1's bubble switching to turn 2's receipt when turn 2 streams.
 *
 * Fixtures: two consecutive live `context_receipt` events (admin@admin.com's
 * Quick Test Agent on /notes, 2026-09-30), rows trimmed, fields verbatim.
 */

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { CxMessageRow } from "../../thunks/conversation-bundle";
import { messageRowToRecord } from "../../thunks/conversation-bundle";
import messagesReducer, {
  addOptimisticUserMessage,
  hydrateMessages,
  promoteMessageId,
  type MessageRecord,
} from "../messages.slice";
import instanceContextReducer, {
  setContextReceipt,
} from "../../instance-context/instance-context.slice";
import {
  receiptRowToResolved,
  selectMessageContextReceipt,
  selectMessageContextReceiptSource,
} from "../message-context-receipt";
import type { ContextReceiptData } from "@/types/python-generated/stream-events";
import captured from "./fixtures/notes-context-receipts.json";

const FIRST = captured.first as ContextReceiptData;
const SECOND = captured.second as ContextReceiptData;
const CONVERSATION = "4f1c2d8e-7b3a-4e51-9a0c-2d6b8e1f7a93";

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      messages: messagesReducer,
      instanceContext: instanceContextReducer,
    }),
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;
const asRoot = (store: Store) => store.getState() as unknown as RootState;

function sendTurn(store: Store, tempId: string, requestId: string, text: string, position: number) {
  store.dispatch(
    addOptimisticUserMessage({
      conversationId: CONVERSATION,
      clientTempId: tempId,
      content: [{ type: "text", text }],
      position,
      requestId,
    }),
  );
}

function streamReceipt(store: Store, requestId: string, receipt: ContextReceiptData) {
  store.dispatch(
    setContextReceipt({
      conversationId: CONVERSATION,
      requestId,
      receipt,
      receivedAt: 1,
      mismatches: [],
    }),
  );
}

/** A `chat.message` user row as the bundle RPC returns it. */
function userRow(id: string, position: number, modelContext: unknown): CxMessageRow {
  return {
    id,
    conversation_id: CONVERSATION,
    agent_id: "92c37a37-7630-4517-b2a2-b6f1d2427208",
    role: "user",
    content: [{ type: "text", text: "Which stage produces the most ATP?" }],
    content_history: null,
    user_content: null,
    position,
    source: "user",
    status: "active",
    is_visible_to_model: true,
    is_visible_to_user: true,
    metadata: {},
    created_at: "2026-09-30T18:04:11.000Z",
    deleted_at: null,
    tools_on_call: null,
    model_context: modelContext,
    error: null,
    voice: null,
  } as unknown as CxMessageRow;
}

const persistedContext = (receipt: unknown) => ({
  scope: { organization_id: null, project_id: null, task_id: null },
  items: [],
  agent_block: null,
  rendered: null,
  total_chars: 0,
  delivery: {
    offered: ["current_note_title", "note_bundle"],
    inline: ["current_note_title", "note_bundle"],
    deferred: [],
    dropped_by_policy: [],
    seeds_skipped: [],
    auto_context_disabled: false,
    user_overridden: ["open_notes_summary"],
    receipt,
  },
});

describe("the bundle mapper", () => {
  it.each([
    ["turn 1", FIRST, 8],
    ["turn 2", SECOND, 3],
  ])("carries the persisted receipt of %s onto the record", (_name, receipt, rows) => {
    const record = messageRowToRecord(userRow("b2d0c6a1-1", 5, persistedContext(receipt)));
    expect(record.modelContext?.delivery?.receipt).toEqual(receipt);
    expect(record.modelContext?.delivery?.receipt?.rows).toHaveLength(rows);
    expect(record.modelContext?.delivery?.user_overridden).toEqual(["open_notes_summary"]);
  });

  it("drops a malformed receipt instead of showing an empty table", () => {
    const record = messageRowToRecord(userRow("b2d0c6a1-2", 5, persistedContext({ rows: "nope" })));
    expect(record.modelContext?.delivery?.receipt).toBeUndefined();
    expect(record.modelContext?.delivery?.offered).toEqual(["current_note_title", "note_bundle"]);
  });
});

describe("selectMessageContextReceipt", () => {
  it("keeps each turn's own live receipt after the next turn streams", () => {
    const store = makeStore();
    sendTurn(store, "tmp-1", "req-1", "Summarize the three stages.", 0);
    streamReceipt(store, "req-1", FIRST);
    store.dispatch(promoteMessageId({ conversationId: CONVERSATION, oldId: "tmp-1", newId: "msg-1", position: 0 }));
    sendTurn(store, "tmp-2", "req-2", "Which stage produces the most ATP?", 2);
    streamReceipt(store, "req-2", SECOND);

    expect(selectMessageContextReceipt(CONVERSATION, "msg-1")(asRoot(store))).toBe(FIRST);
    expect(selectMessageContextReceipt(CONVERSATION, "tmp-2")(asRoot(store))).toBe(SECOND);
    expect(selectMessageContextReceiptSource(CONVERSATION, "msg-1")(asRoot(store))).toBe("live");
  });

  it("prefers the persisted receipt over the live one", () => {
    const store = makeStore();
    sendTurn(store, "tmp-1", "req-1", "Which stage produces the most ATP?", 2);
    streamReceipt(store, "req-1", FIRST);
    // The reloaded row arrives (hydrate keeps the live link) carrying what
    // the server persisted for that turn.
    const persisted = messageRowToRecord(userRow("tmp-1", 2, persistedContext(SECOND)));
    store.dispatch(hydrateMessages({ conversationId: CONVERSATION, messages: [persisted] }));

    expect(selectMessageContextReceipt(CONVERSATION, "tmp-1")(asRoot(store))).toEqual(SECOND);
    expect(selectMessageContextReceiptSource(CONVERSATION, "tmp-1")(asRoot(store))).toBe("persisted");
  });

  it("never gives an old message the conversation's latest live receipt", () => {
    const store = makeStore();
    const old: MessageRecord = messageRowToRecord(userRow("old-1", 0, null));
    store.dispatch(hydrateMessages({ conversationId: CONVERSATION, messages: [old] }));
    streamReceipt(store, "req-9", SECOND);

    expect(selectMessageContextReceipt(CONVERSATION, "old-1")(asRoot(store))).toBeUndefined();
    expect(selectMessageContextReceiptSource(CONVERSATION, "old-1")(asRoot(store))).toBeUndefined();
  });
});

describe("receiptRowToResolved", () => {
  it("groups by who supplied the value and keeps the server's applied limit", () => {
    const rows = FIRST.rows!.map(receiptRowToResolved);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.client.origin).toBe("attached");
    expect(byKey.note_bundle.origin).toBe("page");
    expect(byKey.note_bundle.layers?.default_max).toBe(12000);
    expect(byKey.route_brief.delivery).toBe("on_request");
  });

  it("names a rule row whose label is its key in words, with the person's rule", () => {
    const off = SECOND.rows!.map(receiptRowToResolved).find((r) => r.key === "open_notes_summary")!;
    expect(off.label).toBe("Open Notes Summary");
    expect(off.include).toBe(false);
    expect(off.userRule).toEqual({ include: false });
  });
});
