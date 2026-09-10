/**
 * GUARD — a conversation created in a mounted surface lands in every history
 * scope whose filters admit it, without a refetch. Before
 * `upsertConversationIntoScopes` existed, the agent-run window's sidebar
 * showed "No conversations yet." above the chat the user was typing in.
 */
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import reducer, {
  setScopeAgentIds,
  setScopePageSuccess,
  setScopeSourceFilter,
  upsertConversationIntoScopes,
} from "../slice";

const AGENT = "agent-a";
const OTHER = "agent-b";

function row(id: string, over: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    conversationId: id,
    title: `Chat ${id}`,
    updatedAt: "2026-09-09T00:00:00.000Z",
    messageCount: 1,
    status: "active",
    isFavorite: false,
    excludeFromKg: false,
    sourceFeature: "agent-runner",
    ...over,
  };
}

function seeded() {
  let state = reducer(undefined, { type: "@@init" });
  state = reducer(state, setScopeAgentIds({ scopeId: "runner:a", agentIds: [AGENT] }));
  state = reducer(state, setScopeAgentIds({ scopeId: "runner:b", agentIds: [OTHER] }));
  state = reducer(state, setScopeAgentIds({ scopeId: "chat", agentIds: [] }));
  state = reducer(
    state,
    setScopeSourceFilter({
      scopeId: "chat",
      includeSourceFeatures: ["chat"],
      includeSourceApps: [],
      includeEmptySource: false,
    }),
  );
  for (const scopeId of ["runner:a", "runner:b", "chat"]) {
    state = reducer(
      state,
      setScopePageSuccess({ scopeId, items: [], hasMore: false, replace: true, nextOffset: 0 }),
    );
  }
  return state;
}

describe("upsertConversationIntoScopes", () => {
  it("adds the live conversation to the scope filtered to its agent, and nowhere it is filtered out", () => {
    const state = reducer(
      seeded(),
      upsertConversationIntoScopes({ row: row("c1"), agentId: AGENT }),
    );
    expect(state.scopes["runner:a"].items.map((i) => i.conversationId)).toEqual(["c1"]);
    expect(state.scopes["runner:a"].items[0].agentId).toBe(AGENT);
    expect(state.scopes["runner:b"].items).toEqual([]);
    // /chat allow-lists source_feature=chat; an agent-runner row stays out.
    expect(state.scopes["chat"].items).toEqual([]);
  });

  it("admits an unfiltered scope and dedupes repeats", () => {
    let state = reducer(
      seeded(),
      setScopeSourceFilter({
        scopeId: "chat",
        includeSourceFeatures: [],
        includeSourceApps: [],
        includeEmptySource: false,
      }),
    );
    state = reducer(state, upsertConversationIntoScopes({ row: row("c1"), agentId: AGENT }));
    state = reducer(
      state,
      upsertConversationIntoScopes({ row: row("c1", { title: "Renamed" }), agentId: AGENT }),
    );
    expect(state.scopes["chat"].items).toHaveLength(1);
    expect(state.scopes["chat"].items[0].title).toBe("Renamed");
  });
});
