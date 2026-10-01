/**
 * A delivered inbox message renders ONCE, whatever order the database row and
 * the stream's echo arrive in (PB-05 W-43, 2026-10-01).
 *
 * Seen live on the preview (conversation f9fa875a…, Compass Itinerary Clerk):
 * a moving coordinator steers "Add a stop at Harbor Self Storage for the
 * Lindqvist family's unit 312." mid-run, reloads while the run is live, and the
 * line renders twice — `chat.message` holds one row (position 12). The reload
 * hydrates that row from the database AND the rejoin replays the stream from
 * frame one, whose `injection_consumed` echo seeds an optimistic
 * `inbox_<injection_id>` bubble the server never promotes again.
 *
 * Break this guards: a client-pending user row surviving beside the durable
 * row that already holds the same words at the same position.
 */
import { configureStore } from "@reduxjs/toolkit";
import messagesReducer, {
  addOptimisticUserMessage,
  hydrateMessages,
  type MessageRecord,
} from "../messages.slice";

const CONV = "f9fa875a-bce3-4428-819b-3d412d40851a";
const STEER = "Add a stop at Harbor Self Storage for the Lindqvist family's unit 312.";
const FIRST = "Now draft the 40-stop itinerary for the Castellano move, Fresno to Omaha.";

function row(id: string, role: MessageRecord["role"], position: number, text: string): MessageRecord {
  return {
    id,
    conversationId: CONV,
    agentId: null,
    role,
    content: [{ type: "text", text }],
    contentHistory: null,
    userContent: role === "user" ? [{ type: "text", text }] : null,
    position,
    source: "user",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-10-01T10:11:45.372Z",
    deletedAt: null,
  };
}

const persisted = [
  row("d1e0a4c2-0009-4c11-9a51-5d8b2f0e7a09", "user", 9, FIRST),
  row("d1e0a4c2-0010-4c11-9a51-5d8b2f0e7a10", "assistant", 10, "Stop 1 — Castellano residence, Fresno CA"),
  row("d1e0a4c2-0012-4c11-9a51-5d8b2f0e7a12", "user", 12, STEER),
];

function store() {
  return configureStore({
    reducer: { messages: messagesReducer },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function echo(position: number, text = STEER) {
  return addOptimisticUserMessage({
    conversationId: CONV,
    clientTempId: "inbox_5b8f1e2a-6c3d-4e7f-8a9b-0c1d2e3f4a5b",
    content: [{ type: "text", text }],
    position,
  });
}

function textsInOrder(s: ReturnType<typeof store>): string[] {
  const e = s.getState().messages.byConversationId[CONV];
  return e.orderedIds.map((id) => {
    const part = e.byId[id].content[0] as { text?: string };
    return part.text ?? "";
  });
}

describe("a delivered inbox message renders once", () => {
  it("database row first, then the replayed stream echo (reload mid-run)", () => {
    const s = store();
    s.dispatch(hydrateMessages({ conversationId: CONV, messages: persisted }));
    s.dispatch(echo(12));
    expect(textsInOrder(s).filter((t) => t === STEER)).toHaveLength(1);
  });

  it("stream echo first, then the terminal re-read of the database", () => {
    const s = store();
    s.dispatch(hydrateMessages({ conversationId: CONV, messages: persisted.slice(0, 2) }));
    s.dispatch(echo(12));
    s.dispatch(hydrateMessages({ conversationId: CONV, messages: persisted }));
    expect(textsInOrder(s).filter((t) => t === STEER)).toHaveLength(1);
  });

  it("keeps the echo when no persisted row holds those words yet", () => {
    const s = store();
    s.dispatch(hydrateMessages({ conversationId: CONV, messages: persisted.slice(0, 2) }));
    s.dispatch(echo(12));
    expect(textsInOrder(s)).toEqual([FIRST, "Stop 1 — Castellano residence, Fresno CA", STEER]);
  });

  it("keeps a genuinely repeated line the person sent again at a new position", () => {
    const s = store();
    s.dispatch(hydrateMessages({ conversationId: CONV, messages: persisted }));
    s.dispatch(echo(14));
    expect(textsInOrder(s).filter((t) => t === STEER)).toHaveLength(2);
  });
});
