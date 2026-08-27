import fs from "node:fs";
import path from "node:path";

describe("GSC page breakdown index predicate", () => {
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "migrations/seo_gsc_breakdown_page_index_predicate.sql",
    ),
    "utf8",
  );

  it("compares UUID page filters against the indexed uuid column", () => {
    expect(migration).toContain("spd.page_id = f_pe_uuid");
    expect(migration).not.toContain(
      "OR spd.page_id::text = f_pe OR",
    );
  });

  it("keeps literal page URLs supported without sharing the UUID branch", () => {
    expect(migration).toContain(
      "f_pe_uuid IS NULL AND spd.extras->>''page_url'' = f_pe",
    );
    expect(migration).toContain("plan_cache_mode = 'force_custom_plan'");
  });
});
