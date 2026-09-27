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

describe("surface agent hints in the emitted SQL", () => {
  const CLASSES = "matrx-user/education-classes";
  const sql = () =>
    emitSurfaceSyncSql({ surfaceNames: [CLASSES], organizationId: SYSTEM_ORG });

  function valueRow(text: string, name: string): string {
    const line = text
      .split("\n")
      .find((l) => l.startsWith(`('${SYSTEM_ORG}', 'public', '${CLASSES}', '', '${name}',`));
    if (!line) throw new Error(`no value row for ${name}`);
    return line;
  }

  it("writes max_inline_chars on every value row and rewrites it on conflict", () => {
    const text = sql();
    const start = text.indexOf("INSERT INTO ui.ui_surface_value (");
    const header = text.slice(start, text.indexOf(") VALUES", start));
    expect(header).toContain("max_inline_chars");
    const conflict = text.slice(text.indexOf("ON CONFLICT", start));
    expect(conflict.slice(0, conflict.indexOf(";\n"))).toContain(
      "max_inline_chars = EXCLUDED.max_inline_chars",
    );
    // The column is the row's last value (after synced_from).
    expect(valueRow(text, "owned_classes")).toMatch(/, 12000\),?$/);
    expect(valueRow(text, "joined_classes")).toMatch(/, 4000\),?$/);
    // A value with no inlineUpTo stores NULL = the platform default.
    expect(valueRow(text, "organization_state")).toMatch(/, NULL\),?$/);
  });

  it("appends the guide pointer inside the stored intro, on insert and on update", () => {
    const text = sql();
    const pointer =
      "For the full guide to this page, load skill `surface-guide-education-classes` (skill tool, action get) before writing.\n</surface_intro>";
    const insert = text.slice(0, text.indexOf("ON CONFLICT (name) DO NOTHING"));
    const update = text.slice(text.indexOf("UPDATE ui.ui_surface SET"));
    expect(insert).toContain(pointer);
    expect(update.slice(0, update.indexOf("WHERE name ="))).toContain(pointer);
  });

  it("upserts the guide as a public system reference skill, governance insert-only", () => {
    const text = sql();
    const update = text.slice(text.indexOf("UPDATE skill.definition SET"));
    const updateStmt = update.slice(0, update.indexOf(";\n"));
    expect(updateStmt).toContain(
      "label = 'My Classes — how to work on this page'",
    );
    expect(updateStmt).toContain("WHERE skill_id = 'surface-guide-education-classes'");
    expect(updateStmt).not.toMatch(/organization_id\s*=\s*'[^']*',/);
    expect(updateStmt).not.toMatch(/visibility\s*=/);
    const insert = text.slice(text.indexOf("INSERT INTO skill.definition"));
    expect(insert).toContain(
      `'reference', '# My Classes — how to work on this page`,
    );
    expect(insert).toContain(`true, true, '${SYSTEM_ORG}', 'public'`);
    expect(insert).toContain(
      "WHERE NOT EXISTS (SELECT 1 FROM skill.definition WHERE skill_id = 'surface-guide-education-classes'",
    );
  });

  it("emits no skill SQL for a surface without a guide", () => {
    const text = emitSurfaceSyncSql({
      surfaceNames: [SURFACE],
      organizationId: SYSTEM_ORG,
    });
    expect(text).not.toContain("skill.definition");
    expect(text).not.toContain("load skill `surface-guide-");
  });
});
