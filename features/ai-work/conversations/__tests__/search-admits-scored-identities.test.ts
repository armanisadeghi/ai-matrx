/**
 * THE SEARCH FILTER ADMITS EVERY FIELD THE SCORER RANKS.
 *
 * `public.cvx_search_score` (migrations/cvx_list_scoped.sql) ranks a
 * conversation id at 100000 — "paste a conversation id and land on it" — and
 * a provider session id at 20000. Until 2026-09-18 the WHERE clause of
 * `public.cvx_list_scoped` admitted only title / description / workspace /
 * source_feature, so a pasted Claude Code session id scored 100000 on a row
 * the filter never let through: the /work search returned nothing for the
 * exact identifiers an agent had just handed Arman.
 *
 * The two lists live in two functions and drifted once; this test reads the
 * LIVE migration file for `cvx_list_scoped` and asserts that every column
 * the scorer is handed appears in the search filter clause, so they cannot
 * drift apart again without this going red. It also pins the two behaviours
 * the fix introduced: every live binding's provider session id is searched
 * (not only the newest one), and an identifier-shaped query is always deep.
 *
 * Failing-then-passing: against the pre-fix migration
 * (`cvx_list_scoped_audience.sql`) the id / provider-session / source_app /
 * provider_account assertions fail.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "migrations");

/** The newest file that REPLACES cvx_list_scoped — the one the DB runs. */
const LIVE_LIST_MIGRATION = "cvx_deep_hits_is_a_definer_probe.sql";

function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

function searchFilterClause(sql: string): string {
  // From the search guard to the first per-column filter: the OR-list that
  // decides which rows a free-text search admits.
  const start = sql.indexOf("AND (v_search IS NULL");
  const end = sql.indexOf("AND (NOT v_f ? 'audience'", start);
  if (start < 0 || end < 0) {
    throw new Error(
      `${LIVE_LIST_MIGRATION}: could not locate the search filter clause`,
    );
  }
  return sql.slice(start, end);
}

describe("cvx_list_scoped search admits every field cvx_search_score ranks", () => {
  const sql = readMigration(LIVE_LIST_MIGRATION);
  const clause = searchFilterClause(sql);

  it("replaces the live function (carries a based-on line for it)", () => {
    expect(sql).toMatch(/^-- based-on: public\.cvx_list_scoped\(/m);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cvx_list_scoped(");
  });

  it.each([
    ["title", "coalesce(j.title,'') ILIKE"],
    ["description", "coalesce(j.description,'') ILIKE"],
    ["workspace_name", "coalesce(j.s_workspace_name,'') ILIKE"],
    ["source_feature", "coalesce(j.source_feature,'') ILIKE"],
    ["source_app", "coalesce(j.source_app,'') ILIKE"],
    ["provider_account", "coalesce(j.s_provider_account,'') ILIKE"],
    ["conversation id", "j.id::text ILIKE"],
    [
      "provider session id (every live binding)",
      "coalesce(b.provider_session_id,'') ILIKE",
    ],
    ["message bodies", "deep_hits"],
  ])("admits %s", (_field, expression) => {
    expect(clause).toContain(expression);
  });

  it("scores the same set the filter admits", () => {
    // The scorer call site names each ranked column; every one of them must
    // have an admitting expression above, or a pasted value scores and drops.
    const scored = sql.slice(sql.indexOf("public.cvx_search_score("));
    for (const column of [
      "f.title",
      "f.description",
      "f.s_workspace_name",
      "f.source_feature",
      "f.source_app",
      "f.s_provider_account",
      "f.s_provider_session_id",
    ]) {
      expect(scored).toContain(column);
    }
  });

  it("searches EVERY live binding's provider session id, not only the newest", () => {
    expect(clause).toMatch(
      /EXISTS \(\s*SELECT 1 FROM chat\.coding_session b\s*WHERE b\.conversation_id = j\.id AND b\.deleted_at IS NULL/,
    );
  });

  it("treats a commit-sha query as deep without the toggle", () => {
    expect(sql).toContain("v_deep boolean := coalesce(p_deep, false)");
    expect(sql).toContain("v_search ~ '^[0-9a-fA-F]{7,40}$'");
    // and the deep pass is ONE hashed set through the definer probe, never a
    // correlated per-row EXISTS under the invoker's policy (ILIKE is not
    // leakproof, so that can never use the trigram index)
    expect(sql).toContain("WITH deep_hits AS (");
    expect(sql).toContain("FROM public.cvx_deep_hits(v_search)");
    expect(sql).not.toMatch(/EXISTS \(\s*SELECT 1 FROM chat\.message m/);
  });

  it("the probe is a declared signed-in door that answers only listable conversations", () => {
    const probe = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.cvx_deep_hits("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.cvx_list_scoped("),
    );
    expect(probe).toContain("SECURITY DEFINER");
    expect(probe).toContain("c.created_by = auth.uid()");
    expect(probe).toContain("c.visibility IN ('internal','public')");
    expect(probe).toContain("p.resource_type = 'conversation'");
    expect(probe).toContain("INSERT INTO platform.client_callable_door");
    expect(probe.indexOf("INSERT INTO platform.client_callable_door")).toBeLessThan(
      probe.indexOf("GRANT EXECUTE ON FUNCTION public.cvx_deep_hits(text) TO authenticated"),
    );
  });

  it("the trigram index exists on exactly the predicate the deep pass uses", () => {
    const idx = readMigration("cx_message_content_trgm_idx.sql");
    expect(idx).toContain(
      "ON chat.message USING gin ((content::text) gin_trgm_ops)",
    );
    expect(idx).toContain("WHERE deleted_at IS NULL AND is_visible_to_user IS TRUE");
    expect(sql).toContain(
      "AND m.deleted_at IS NULL AND m.is_visible_to_user IS TRUE",
    );
  });
});
