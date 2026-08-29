import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "migrations/mnd_list_scoped.sql");

describe("mnd_list_scoped post-cutover storage", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("reads only the canonical mandate schema", () => {
    expect(sql).toContain("FROM mandate.definition m");
    expect(sql).toContain("FROM mandate.binding b");
    expect(sql).toContain("LEFT JOIN mandate.provision pr");
    expect(sql).not.toMatch(/agent\.(?:mandate|mandate_binding|provision)\b/);
  });

  it("uses the canonical Holder columns and version-null latest rule", () => {
    expect(sql).toContain("b.holder_id AS ub_agent_id");
    expect(sql).toContain("b.holder_version_id AS ub_version_id");
    expect(sql).toContain("m.default_holder_id");
    expect(sql).toContain("m.default_holder_version_id IS NULL");
    expect(sql).not.toMatch(/\bb\.(?:agent_id|agent_version_id|use_latest)\b/);
    expect(sql).not.toMatch(/\bm\.(?:default_agent_id|default_agent_version_id|use_latest)\b/);
  });
});
