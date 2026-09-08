import { readFileSync } from "node:fs";
import { join } from "node:path";

// The LIVE definition of cvx_list_scoped / cvx_list_facets is the newest
// migration in this family. Every earlier file is history; this test pins the
// one that is deployed so a regression cannot hide in a superseded file.
const migration = readFileSync(
  join(process.cwd(), "migrations/cvx_list_scoped_audience.sql"),
  "utf8",
);

const privilegeMigration = readFileSync(
  join(
    process.cwd(),
    "migrations/cvx_list_scoped_revoke_anon_execute.sql",
  ),
  "utf8",
);

describe("cvx_list_scoped canonical favorites migration", () => {
  it("reads, filters, projects, and sorts the caller's user_entity_state favorite", () => {
    expect(migration).toContain(
      "LEFT JOIN platform.user_entity_state ues",
    );
    expect(migration).toContain("ues.user_id = v_uid");
    expect(migration).toContain("ues.entity_type = 'conversation'");
    expect(migration).toContain("ues.entity_id = s.id");
    expect(migration).toContain(
      "coalesce(ues.is_favorite, false) AS s_is_favorite",
    );

    expect(migration).toContain(
      "coalesce(j.s_is_favorite,false) IS NOT DISTINCT FROM",
    );
    expect(migration).toContain(
      "c.source_feature, c.status, c.message_count, c.s_is_favorite,",
    );
    expect(migration).toContain(
      "CASE WHEN p_favorites_first THEN c.s_is_favorite END DESC NULLS LAST",
    );
    expect(migration).toContain(
      "CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.s_is_favorite END DESC",
    );

    // The shared conversation column is frozen history. Reintroducing either
    // alias would silently split the read from the canonical ues_set write.
    expect(migration).not.toMatch(/\bj\.is_favorite\b/);
    expect(migration).not.toMatch(/\bc\.is_favorite\b/);
  });

  it("removes anonymous access retained by CREATE OR REPLACE", () => {
    expect(privilegeMigration).toMatch(/from public, anon;/);
    expect(privilegeMigration).toMatch(/to authenticated;/);
  });
});

describe("cvx_list_scoped audience buckets", () => {
  it("derives the bucket ONCE, server-side, and shares it with the facets", () => {
    // One expression, used by both RPCs — a chip count equals a click result.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.cvx_audience(");
    expect(migration).toContain(
      "public.cvx_audience(cs.provider, s.source_app, s.origin_class, s.conversation_type)",
    );
    expect(migration).toContain(
      "public.cvx_audience(r.provider, r.source_app, r.origin_class, r.conversation_type)",
    );
  });

  it("classifies with the ruled precedence: external > machine origin > human > legacy type", () => {
    const fn = migration.slice(
      migration.indexOf("public.cvx_audience("),
      migration.indexOf("REVOKE ALL ON FUNCTION public.cvx_audience"),
    );
    const external = fn.indexOf("THEN 'external'");
    const internalByOrigin = fn.indexOf("THEN 'internal'");
    const chatByOrigin = fn.indexOf("THEN 'chat'");
    const legacy = fn.lastIndexOf("THEN 'internal'");
    expect(external).toBeGreaterThan(-1);
    expect(external).toBeLessThan(internalByOrigin);
    expect(internalByOrigin).toBeLessThan(chatByOrigin);
    expect(chatByOrigin).toBeLessThan(legacy);
    expect(fn).toContain("p_source_app IN ('claude-code','codex','cursor','vscode')");
    expect(fn).toContain(
      "p_origin_class IN ('child_agent','workflow','scheduled','system','client_auto')",
    );
    expect(fn).toContain("ELSE 'chat'");
  });

  it("filters on the `audience` key and reports bucket + second-cut facets", () => {
    expect(migration).toContain("NOT v_f ? 'audience'");
    expect(migration).toContain(
      "j.s_audience IN (SELECT jsonb_array_elements_text(v_f->'audience'->'values'))",
    );
    expect(migration).toContain("SELECT 'audience'::text, b.audience, count(*)");
    expect(migration).toContain("SELECT 'audience_source_app'::text");
    expect(migration).toContain("SELECT 'audience_conversation_type'::text");
  });
});
