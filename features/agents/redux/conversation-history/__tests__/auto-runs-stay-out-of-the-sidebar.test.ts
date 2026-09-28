/**
 * GUARD (verify-1, 2026-09-28) — a background run client code fired on its
 * own (`initiation: "auto"`, e.g. one run per section of a flashcard deck) is
 * the Auto lane, never a chat in the person's sidebar. Before this the live
 * insert put every section run ("…section 3 of 6: Chunk…") into /chat's list.
 */
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { DEFAULT_CONVERSATION_LANES, laneOfClientMintedRow } from "../lanes";
import reducer, {
  setScopeLanes,
  setScopePageSuccess,
  upsertConversationIntoScopes,
} from "../slice";

function row(id: string, over: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    conversationId: id,
    title: "Osmosis - section 3 of 6: Page 4",
    updatedAt: "2026-09-28T00:00:00.000Z",
    messageCount: 1,
    status: "active",
    isFavorite: false,
    excludeFromKg: false,
    sourceFeature: "education-flashcards",
    ...over,
  };
}

describe("auto runs stay out of the sidebar", () => {
  it("classifies a client_auto row as the Auto lane", () => {
    expect(laneOfClientMintedRow("education-flashcards", "client_auto")).toBe("auto");
    expect(laneOfClientMintedRow("chat", "client_auto")).toBe("auto");
    expect(laneOfClientMintedRow("education-flashcards")).toBe("matrx");
  });

  it("never live-inserts an auto run into a default (Chat + Matrx) scope", () => {
    let state = reducer(undefined, { type: "@@init" });
    state = reducer(state, setScopeLanes({ scopeId: "chat", lanes: [...DEFAULT_CONVERSATION_LANES] }));
    state = reducer(
      state,
      setScopePageSuccess({ scopeId: "chat", items: [], hasMore: false, replace: true, nextOffset: 0 }),
    );
    state = reducer(
      state,
      upsertConversationIntoScopes({ row: row("auto-1", { originClass: "client_auto" }), agentId: "a" }),
    );
    state = reducer(state, upsertConversationIntoScopes({ row: row("person-1"), agentId: "a" }));
    const ids = state.scopes.chat.items.map((i) => i.conversationId);
    expect(ids).toContain("person-1");
    expect(ids).not.toContain("auto-1");
  });
});
