/**
 * GUARD — a stream that re-announces a conversation the lists already know
 * never blanks what they know.
 *
 * Real test 2026-10-03 (/chat, conversation cc8079e9…): the person reloaded
 * one second into an answer. The cold page rejoined the live stream, which
 * replays from frame one — including `record_reserved` for the conversation.
 * process-stream then upserts a row BUILT FROM THE CLIENT'S EXECUTION STATE
 * (title "" because the history title had not loaded, messageCount 1,
 * createdAt now, isFavorite false) into every list, and the merge let those
 * placeholders overwrite the server's row: the sidebar showed
 * "Conversation cc8079" instead of "Ingrid Strand crown debt & deposit".
 *
 * Both list stores take that row (`conversationHistory` scopes and the
 * `conversationList` entity store), so both are checked here.
 */
import type { ConversationListItem } from "../../conversation-list/conversation-list.types";
import historyReducer, {
  setScopeAgentIds,
  setScopePageSuccess,
  upsertConversationIntoScopes,
} from "../slice";
import listReducer, {
  upsertConversationInCaches,
} from "../../conversation-list/conversation-list.slice";

const AGENT = "agent-general-chat";
const ID = "cc8079e9-b8ea-41a5-bb28-59cca2005bf3";

const serverRow: ConversationListItem = {
  conversationId: ID,
  title: "Ingrid Strand crown debt & deposit",
  description: "Balance and second-crown deposit",
  createdAt: "2026-10-03T22:09:20.000Z",
  updatedAt: "2026-10-03T22:10:00.000Z",
  messageCount: 7,
  status: "active",
  isFavorite: true,
  excludeFromKg: true,
  sourceFeature: "chat",
};

/** What buildConversationListItemFromExecution produces on a cold rejoin. */
const rejoinPlaceholder: ConversationListItem = {
  conversationId: ID,
  title: "",
  description: "",
  createdAt: "2026-10-03T22:12:40.000Z",
  updatedAt: "2026-10-03T22:12:40.000Z",
  messageCount: 1,
  status: "active",
  isFavorite: false,
  excludeFromKg: false,
  sourceFeature: "chat",
};

describe("a rejoined stream re-announcing a known conversation", () => {
  it("keeps the history sidebar's title, description, count, dates and flags", () => {
    let state = historyReducer(undefined, { type: "@@init" });
    state = historyReducer(state, setScopeAgentIds({ scopeId: "chat", agentIds: [] }));
    state = historyReducer(
      state,
      setScopePageSuccess({
        scopeId: "chat",
        items: [serverRow],
        hasMore: false,
        replace: true,
        nextOffset: 1,
      }),
    );
    state = historyReducer(
      state,
      upsertConversationIntoScopes({ row: rejoinPlaceholder, agentId: AGENT }),
    );
    const [item] = state.scopes["chat"].items;
    expect(item.title).toBe("Ingrid Strand crown debt & deposit");
    expect(item.description).toBe("Balance and second-crown deposit");
    expect(item.messageCount).toBe(7);
    expect(item.createdAt).toBe("2026-10-03T22:09:20.000Z");
    expect(item.isFavorite).toBe(true);
    expect(item.excludeFromKg).toBe(true);
    // The activity itself is news: the row moves to "now".
    expect(item.updatedAt).toBe("2026-10-03T22:12:40.000Z");
  });

  it("keeps the conversationList entity store's title too", () => {
    let state = listReducer(undefined, { type: "@@init" });
    state = listReducer(
      state,
      upsertConversationInCaches({ cacheKeys: [], row: serverRow }),
    );
    state = listReducer(
      state,
      upsertConversationInCaches({ cacheKeys: [], row: rejoinPlaceholder }),
    );
    const item = state.byConversationId[ID];
    expect(item.title).toBe("Ingrid Strand crown debt & deposit");
    expect(item.messageCount).toBe(7);
    expect(item.isFavorite).toBe(true);
  });

  it("still takes a real new title from the stream", () => {
    let state = historyReducer(undefined, { type: "@@init" });
    state = historyReducer(state, setScopeAgentIds({ scopeId: "chat", agentIds: [] }));
    state = historyReducer(
      state,
      setScopePageSuccess({
        scopeId: "chat",
        items: [serverRow],
        hasMore: false,
        replace: true,
        nextOffset: 1,
      }),
    );
    state = historyReducer(
      state,
      upsertConversationIntoScopes({
        row: { ...rejoinPlaceholder, title: "Ingrid Strand timeline" },
        agentId: AGENT,
      }),
    );
    expect(state.scopes["chat"].items[0].title).toBe("Ingrid Strand timeline");
  });
});
