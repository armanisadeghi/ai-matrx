import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "migrations/cvx_list_scoped_canonical_favorites.sql",
  ),
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
