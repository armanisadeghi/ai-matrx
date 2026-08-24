import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../../..");
const migration = readFileSync(
  join(ROOT, "migrations/seo_topic_demand_accuracy_and_timeout.sql"),
  "utf8",
);
const indexMigration = readFileSync(
  join(ROOT, "migrations/seo_topic_demand_membership_index.sql"),
  "utf8",
);

const demandFunctions = [
  "gsc_topic_stats",
  "gsc_topic_offering_split",
  "gsc_topic_unassigned_keywords",
  "gsc_topic_proposed_keywords",
  "fn_refresh_topic_placement_queue",
] as const;

function functionBody(name: (typeof demandFunctions)[number]): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION seo.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION seo.", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("SEO topic demand migration contract", () => {
  it("indexes the exact all-history membership probe without blocking writes", () => {
    expect(indexMigration).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS");
    expect(indexMigration).toContain("(site_id, keyword_id)");
    expect(indexMigration).toContain("provider = 'gsc'");
    expect(indexMigration).toContain("dimension_profile = 'query'");
    expect(indexMigration).toContain("keyword_id IS NOT NULL");
  });

  it.each(demandFunctions)("keeps %s on canonical query demand", (name) => {
    const body = functionBody(name);
    expect(body).toContain("provider = 'gsc'");
    expect(body).toContain("dimension_profile = 'query'");
    expect(body).toContain("DISTINCT ON (spd.date)");
    expect(body).toContain("ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC");
  });

  it("builds topic membership from the small link set and probes demand history", () => {
    const body = functionBody("gsc_topic_stats");
    const links = body.indexOf("FROM seo.keyword_topic kt");
    const membership = body.indexOf("FROM seo.search_performance_daily membership");

    expect(links).toBeGreaterThanOrEqual(0);
    expect(membership).toBeGreaterThan(links);
    expect(body).not.toContain("site_kw AS MATERIALIZED");
    expect(body).toContain("membership.keyword_id = kt.keyword_id");
    expect(body).toContain("seo.keyword_value_map(");
    expect(body).toContain("array_agg(DISTINCT l.kw_id)");
  });

  it("reconciles stale placement rows without stealing an active claim", () => {
    const body = functionBody("fn_refresh_topic_placement_queue");
    expect(body).toContain("DELETE FROM seo.topic_placement_queue q");
    expect(body).toContain("q.status <> 'running'");
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM scored s");
    expect(body).toContain("FROM public, anon, authenticated");
  });
});
