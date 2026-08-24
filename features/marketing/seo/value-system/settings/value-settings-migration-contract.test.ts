import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    __dirname,
    "../../../../../migrations/seo_value_settings_contract_repair.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION seo.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION seo.", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("value settings migration contract", () => {
  it("keeps the reserved guard in every settings payload", () => {
    const body = functionBody("value_settings_scope");
    expect(body).toContain(
      "c.dimension='seo_value_band' AND c.deleted_at IS NULL",
    );
    expect(body).not.toContain(
      "c.dimension='seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'",
    );
    expect(body).toContain("NULLS LAST");
  });

  it("normalizes compact ladder levels before canonical validation and site storage", () => {
    const body = functionBody("set_value_settings");
    expect(body).toContain("INTO v_compact_levels, v_vocab_levels");
    expect(body).toContain(
      "gsc_assert_vocabulary_coherent('value_band', v_vocab_levels)",
    );
    expect(body).toContain(
      "gsc_save_value_vocabulary(p_id, 'value_band', v_vocab_levels",
    );
    expect(body).toContain("gsc_reset_value_vocabulary");
  });

  it("makes the terminal resolver consume the complete settings ladder", () => {
    const body = functionBody("keyword_value_map");
    expect(body).toContain("FROM seo.fn_value_levels(p_site_id) l");
    expect(body).not.toContain("FROM seo.site_vocabulary sv");
  });

  it("accepts the non-negative KI-048 score scale without an obsolete 100 cap", () => {
    const body = functionBody("gsc_assert_vocabulary_coherent");
    expect(body).toContain("IF ms < 0 THEN");
    expect(body).not.toContain("ms > 100");
  });
});
