/**
 * Guard for the /chat cache-only search defect. These assertions force the
 * consumer surface to call the ranked RPC, preserve every sidebar filter, and
 * keep progressive range/count/deep-search doors visible.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildConversationSearchArgs,
  countConversationSearchCorpus,
  conversationSearchRangeLabel,
  initialConversationSearchRange,
  nextConversationSearchRange,
} from "../conversation-search";
import type { ConversationHistoryScopeState } from "../types";

const repoRoot = path.resolve(__dirname, "../../../../..");

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

const scope: ConversationHistoryScopeState = {
  agentIds: ["00000000-0000-0000-0000-000000000001"],
  excludeSourceFeatures: ["voice-agent"],
  includeSourceFeatures: ["chat-route"],
  includeSourceApps: ["matrx-admin"],
  includeEmptySource: true,
  includeOriginClasses: ["human"],
  includeLanes: ["chat"],
  seededSourceKey: null,
  searchTerm: "",
  grouping: "date",
  pageSize: 30,
  offset: 0,
  items: [],
  hasMore: false,
  status: "idle",
  error: null,
  lastFetchedAt: null,
};

describe("/chat authoritative server search", () => {
  it("adapts the first range to library size and widens deterministically", () => {
    expect(initialConversationSearchRange(100, 30)).toBe("all");
    expect(initialConversationSearchRange(500, 30)).toBe("90d");
    expect(initialConversationSearchRange(2_000, 30)).toBe("30d");
    expect(initialConversationSearchRange(10_000, 30)).toBe("7d");
    expect(nextConversationSearchRange("7d")).toBe("30d");
    expect(nextConversationSearchRange("30d")).toBe("90d");
    expect(nextConversationSearchRange("90d")).toBe("all");
    expect(nextConversationSearchRange("all")).toBeNull();
    expect(conversationSearchRangeLabel("all")).toBe("all time");
  });

  it("passes the complete sidebar scope and page window to the RPC", () => {
    expect(
      buildConversationSearchArgs({
        query: "  quarterly plan  ",
        range: "30d",
        deep: true,
        limit: 30,
        offset: 60,
        scope,
      }),
    ).toEqual({
      p_search: "quarterly plan",
      p_since: "30d",
      p_deep: true,
      p_limit: 30,
      p_offset: 60,
      p_exclude_source_features: ["voice-agent"],
      p_include_source_features: ["chat-route"],
      p_include_source_apps: ["matrx-admin"],
      p_include_empty_source: true,
      p_lanes: ["chat"],
      p_agent_ids: ["00000000-0000-0000-0000-000000000001"],
      p_origin_classes: ["human"],
    });
  });

  it("mounts server search only for the chat consumer wrapper", () => {
    const wrapper = read(
      "features/agents/components/chat/ChatHistorySidebar.tsx",
    );
    const shared = read(
      "features/agents/components/conversation-history/ConversationHistorySidebar.tsx",
    );
    expect(wrapper).toContain("serverSearch");
    expect(shared).toContain("Search message text");
    expect(shared).toContain("Show ${nextCount} more");
    expect(shared).toContain("Search {nextLabel}");
    expect(shared).toContain("onMutationSuccess={serverSearchState.retry}");
  });

  it("uses ranked title-first search with exact counts and opt-in deep hits", () => {
    const migration = read("migrations/cx_search_conversations.sql");
    expect(migration).toContain("public.cvx_search_score(");
    expect(migration).toContain("public.cvx_deep_hits(v_search)");
    expect(migration).toContain("where v_deep");
    expect(migration).toContain("count(*) over ()");
    expect(migration).toContain("m.s_score desc");
    expect(migration).toContain(
      "limit least(greatest(coalesce(p_limit, 30), 1), 100)",
    );
    expect(migration).not.toMatch(/c\.status\s*=/);
  });

  it("matches the cache query's null semantics when exclusions are active", () => {
    const migration = read("migrations/cx_search_conversations.sql");
    expect(migration).toContain("c.source_feature is not null");
    expect(migration).toContain(
      "coalesce(array_length(p_exclude_source_features, 1), 0) = 0",
    );
  });

  it("sizes the adaptive range from the effective facet scope", () => {
    expect(
      countConversationSearchCorpus(
        [
          {
            lane: "chat",
            sourceApp: "matrx",
            sourceFeature: "chat-route",
            count: 8,
          },
          {
            lane: "chat",
            sourceApp: "matrx",
            sourceFeature: "voice-agent",
            count: 100,
          },
          {
            lane: "auto",
            sourceApp: "aidream",
            sourceFeature: "workflow",
            count: 500,
          },
          { lane: "chat", sourceApp: null, sourceFeature: null, count: 40 },
        ],
        { ...scope, agentIds: [], includeOriginClasses: [] },
      ),
    ).toBe(8);
    expect(
      countConversationSearchCorpus([], {
        ...scope,
        agentIds: ["00000000-0000-0000-0000-000000000001"],
      }),
    ).toBeNull();
  });

  it("cancels superseded searches as the query or filters change", () => {
    const hook = read(
      "features/agents/components/conversation-history/useConversationServerSearch.ts",
    );
    expect(hook).toContain("activeController.current?.abort()");
    expect(hook).toContain("requestSequence.current");
    expect(hook).toContain("return () => controller.abort()");
  });
});
