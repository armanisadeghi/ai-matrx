/**
 * The app half of the /chat server-search guard (the package half is @ai-matrx/chat's
 * agents/redux/conversation-history/__tests__/server-search.test.ts): the ranked RPC the
 * package calls is defined by THIS repo's migration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("/chat authoritative server search — the RPC's SQL", () => {
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

});
