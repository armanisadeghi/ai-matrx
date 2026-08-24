import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../../..");
const migration = readFileSync(
  join(ROOT, "migrations/seo_topic_delete_with_reassignment.sql"),
  "utf8",
);

describe("SEO topic deletion migration contract", () => {
  it("previews the complete shared-catalog blast radius", () => {
    expect(migration).toContain("associated_keywords bigint");
    expect(migration).toContain("affected_organizations bigint");
    expect(migration).toContain("site_worth_rulings bigint");
    expect(migration).toContain("child_topics bigint");
    expect(migration).toContain("starter_pack_items bigint");
    expect(migration).toContain("count(distinct kt.organization_id)");
  });

  it("merges keyword links without losing primary placement", () => {
    expect(migration).toContain("v_primary_keyword_ids uuid[]");
    expect(migration).toContain("#variable_conflict use_column");
    expect(migration).toContain("on conflict (keyword_id, topic_id) do update");
    expect(migration).toContain(
      "is_primary = destination.is_primary or excluded.is_primary",
    );
    expect(migration).toContain("deleted_at = null");
  });

  it("promotes children and removes judgments that cannot be guessed", () => {
    expect(migration).toContain("set parent_id = v_topic.parent_id");
    expect(migration).toContain("update seo.site_topic_value stv");
    expect(migration).toContain("update seo.starter_pack_item spi");
    expect(migration).toContain("update seo.topic t");
  });

  it("is editor-gated and exposes neither RPC to anonymous callers", () => {
    expect(
      migration.match(/perform seo\.gsc_assert_site_editor\(p_site_id\)/g),
    ).toHaveLength(2);
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain(
      "revoke all on function seo.gsc_topic_delete(uuid, uuid, uuid) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function seo.gsc_topic_delete(uuid, uuid, uuid) to authenticated",
    );
  });
});
