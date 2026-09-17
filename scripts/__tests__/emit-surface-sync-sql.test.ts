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
    expect(sql).toContain(
      "Existing ui_client rows are required; this emitter never creates clients.",
    );
    expect(sql).toContain("ON CONFLICT (name) DO NOTHING;");
    expect(sql).not.toContain("INSERT INTO ui.ui_client");
  });

  it("uses explicit system ownership and public visibility in every child mirror", () => {
    const sql = emitSurfaceSyncSql({
      surfaceNames: [SURFACE],
      organizationId: SYSTEM_ORG,
    });
    for (const table of [
      "ui_surface_value",
      "ui_surface_agent_role",
      "ui_surface_write_target",
      "ui_surface_client_tool",
    ]) {
      const start = sql.indexOf(`INSERT INTO ${table} (`);
      if (start < 0) continue;
      const segment = sql.slice(start, sql.indexOf(";", start));
      expect(segment).toContain("organization_id, visibility");
      expect(segment).toContain(`'${SYSTEM_ORG}', 'public'`);
      expect(segment).toContain(
        "organization_id = EXCLUDED.organization_id, visibility = EXCLUDED.visibility",
      );
    }
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
