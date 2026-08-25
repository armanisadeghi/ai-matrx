import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");
const healthMigration = readFileSync(
  join(ROOT, "migrations/seo_gsc_ingestion_health_v5.sql"),
  "utf8",
);
const coverageIndexMigration = readFileSync(
  join(ROOT, "migrations/seo_gsc_ingestion_health_coverage_index.sql"),
  "utf8",
);

describe("GSC ingestion health migration contract", () => {
  it("indexes the exact all-history coverage read without blocking ingestion", () => {
    expect(coverageIndexMigration).toContain("SET statement_timeout = 0");
    expect(coverageIndexMigration).toContain(
      "DROP INDEX CONCURRENTLY IF EXISTS seo.idx_seo_sperf_gsc_health_coverage",
    );
    expect(coverageIndexMigration).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seo_sperf_gsc_health_coverage",
    );
    expect(coverageIndexMigration).toContain("(site_id, date)");
    expect(coverageIndexMigration).toContain("provider = 'gsc'");
    expect(coverageIndexMigration).toContain(
      "dimension_profile <> 'search_appearance'",
    );
  });

  it("keeps the health aggregate aligned with the partial-index predicate", () => {
    expect(healthMigration).toContain("MIN(spd.date), MAX(spd.date)");
    expect(healthMigration).toContain("COUNT(DISTINCT spd.date)");
    expect(healthMigration).toContain("spd.site_id = p_site_id");
    expect(healthMigration).toContain("spd.provider = 'gsc'");
    expect(healthMigration).toContain(
      "spd.dimension_profile <> 'search_appearance'",
    );
  });
});
