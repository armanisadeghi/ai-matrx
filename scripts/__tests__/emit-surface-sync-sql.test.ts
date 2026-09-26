import { emitSurfaceSyncSql } from "@/scripts/emit-surface-sync-sql";

const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";
const SURFACE = "matrx-user/education-flashcard-set";

describe("surface manifest SQL emitter", () => {
  it("registers the selected surface before its children without creating a client", () => {
    const sql = emitSurfaceSyncSql({
      surfaceNames: [SURFACE],
      organizationId: SYSTEM_ORG,
    });
    const surfaceInsert = sql.indexOf("INSERT INTO ui.ui_surface (");
    const valueInsert = sql.indexOf("INSERT INTO ui.ui_surface_value (");
    expect(surfaceInsert).toBeGreaterThanOrEqual(0);
    expect(valueInsert).toBeGreaterThan(surfaceInsert);
    expect(sql).toContain("ON CONFLICT (name) DO NOTHING;");
    expect(sql).not.toContain("INSERT INTO ui.ui_client");
  });

  it("sets system ownership and public visibility on insert only — a conflict never rewrites them (ALC-14 ruling N5)", () => {
    const sql = emitSurfaceSyncSql({
      surfaceNames: [SURFACE],
      organizationId: SYSTEM_ORG,
    });
    let mirrors = 0;
    for (const table of [
      "ui_surface_value",
      "ui_surface_agent_role",
      "ui_surface_write_target",
      "ui_surface_client_tool",
    ]) {
      const start = sql.indexOf(`INSERT INTO ui.${table} (`);
      if (start < 0) continue;
      mirrors += 1;
      // Values may contain ";" inside quoted descriptions, so the statement is
      // bounded by its own ON CONFLICT clause, which ends at ";" + newline.
      const conflictAt = sql.indexOf("ON CONFLICT", start);
      expect(conflictAt).toBeGreaterThan(start);
      const insert = sql.slice(start, conflictAt);
      expect(insert).toContain("organization_id, visibility");
      expect(insert).toContain(`'${SYSTEM_ORG}', 'public'`);
      const end = sql.indexOf(";\n", conflictAt);
      const onConflict = sql.slice(conflictAt, end < 0 ? undefined : end);
      expect(onConflict).toContain("DO UPDATE SET");
      expect(onConflict).not.toMatch(/organization_id\s*=/);
      expect(onConflict).not.toMatch(/visibility\s*=/);
    }
    // The flashcard-set surface declares values, so at least one mirror must be
    // inspected — a loop that finds nothing proves nothing.
    expect(mirrors).toBeGreaterThan(0);
  });

  it("rejects an absent or malformed organization id", () => {
    expect(() =>
      emitSurfaceSyncSql({
        surfaceNames: [SURFACE],
        organizationId: "not-a-uuid",
      }),
    ).toThrow("--organization-id must be a UUID");
  });

  it("does not clear an optional DB-authored surface field when the manifest omits it", () => {
    const sql = emitSurfaceSyncSql({
      surfaceNames: [SURFACE],
      organizationId: SYSTEM_ORG,
    });
    const metadataUpdate = sql.slice(
      sql.lastIndexOf("-- Mirror declared surface metadata"),
    );
    expect(metadataUpdate).not.toContain("overlay_id =");
    expect(metadataUpdate).not.toContain("parent_surface_name =");
  });
});
