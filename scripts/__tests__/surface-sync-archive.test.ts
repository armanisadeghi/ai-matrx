/**
 * The sync must ARCHIVE the code rows a manifest stopped declaring, in every
 * keyed mirror table, on every path that emits SQL — never DELETE, never a
 * database-owned row. Before this, only the admin dialog (opt-in) and the
 * direct sync archived; rows applied through the emitted SQL lived forever
 * (11 `rag-*` write targets, 2026-08-18 → 2026-10-07).
 */
import { planSurfaceSync } from "@ai-matrx/alchemy/checks";
import { createDeclarationRegistry } from "@ai-matrx/alchemy/declare";
import { renderStaleArchiveSql, renderStaleArchiveStatements } from "../lib/surface-sync-archive";

const value = (name: string) => ({
  name,
  label: name,
  description: `The ${name}.`,
  valueType: "string" as const,
  alwaysAvailable: true,
  typicalCharCount: 20,
});

function plan() {
  const registry = createDeclarationRegistry();
  registry.register({
    surfaceName: "matrx-user/archive-fixture",
    client: "matrx-user",
    executionMode: "python-stream",
    description: "Fixture.",
    label: "Fixture",
    readiness: "stub",
    values: [value("kept")],
    itemTypes: [{ name: "card", label: "Card", description: "A card.", identity: ["id"], values: [value("id")] }],
  });
  return planSurfaceSync(registry.all(), {
    organizationId: "39c38960-d30c-4840-b0c1-c9960de95582",
    syncedFrom: "test",
    schema: { itemType: true },
  });
}

describe("renderStaleArchiveSql", () => {
  it("archives undeclared code rows of the covered surfaces, soft, in every keyed table", () => {
    const p = plan();
    const statements = renderStaleArchiveStatements(p);
    for (const table of Object.keys(p.keys)) {
      expect(statements.some((s) => s.startsWith(`UPDATE ${table} SET deleted_at = now()`))).toBe(true);
    }
    expect(Object.keys(p.keys)).toEqual(expect.arrayContaining(["ui.ui_surface_value", "ui.ui_surface_item_type"]));
    const sql = renderStaleArchiveSql(p);
    expect(sql).toMatch(/declared_by = 'code'/);
    expect(sql).toMatch(/surface_name IN \('matrx-user\/archive-fixture'\)/);
    expect(sql).toMatch(/\(surface_name, item_type, name\) NOT IN \(\('matrx-user\/archive-fixture', '', 'kept'\)/);
    expect(sql).not.toMatch(/DELETE FROM/i);
  });

  it("revives a re-declared row and honours skipTables", () => {
    const p = plan();
    expect(renderStaleArchiveSql(p)).toMatch(/SET deleted_at = NULL WHERE deleted_at IS NOT NULL/);
    const skipped = renderStaleArchiveSql(p, { skipTables: ["ui.ui_surface_value"] });
    expect(skipped).not.toMatch(/UPDATE ui\.ui_surface_value /);
    expect(skipped).toMatch(/UPDATE ui\.ui_surface_item_type /);
  });

  it("archives everything a surface owns in a table whose rows were all removed", () => {
    const p = { ...plan(), tables: [] };
    const sql = renderStaleArchiveSql(p);
    expect(sql).toMatch(/UPDATE ui\.ui_surface_value SET deleted_at = now\(\) WHERE deleted_at IS NULL AND declared_by = 'code' AND surface_name IN \('matrx-user\/archive-fixture'\);/);
  });
});

describe("full sync also archives rows of retired surfaces", () => {
  it("archives code rows whose surface no manifest declares, only when given the registry", () => {
    const p = plan();
    expect(renderStaleArchiveSql(p)).not.toMatch(/surface_name NOT IN/);
    const sql = renderStaleArchiveSql(p, { registrySurfaceNames: ["matrx-user/archive-fixture"] });
    expect(sql).toMatch(
      /UPDATE ui\.ui_surface_write_target SET deleted_at = now\(\) WHERE deleted_at IS NULL AND declared_by = 'code' AND surface_name NOT IN \('matrx-user\/archive-fixture'\);/,
    );
  });
});
