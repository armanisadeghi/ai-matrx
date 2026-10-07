/**
 * The archive half of the ONE manifest sync, as SQL.
 *
 * The plan's upsert only adds and updates. A code-declared mirror row that a
 * manifest no longer declares must stop being advertised, so every sync path
 * that emits SQL (the MCP-applied emitter, the direct sync) also ARCHIVES it:
 * `deleted_at = now()` — never a DELETE (ALC-14, PLAN rule 14: orphans are
 * archived). A re-declared archived row is revived. Only `declared_by = 'code'`
 * rows of the surfaces the plan covers are touched; a database-owned row is
 * never addressed (a DB trigger refuses that as well).
 *
 * Covers EVERY table the plan keys — values, write targets, item types, agent
 * roles, client tools, code actions — so a new mirror table inherits it.
 */
import { sqlLiteral, type SurfaceSyncPlan } from "@ai-matrx/alchemy/checks";

const IDENT = /^[a-z_]+\.[a-z_]+$/;

export interface RenderArchiveOptions {
  /** Plan tables (`ui.<name>`) another step already archives and reports on. */
  skipTables?: readonly string[];
  /**
   * Every surface the registry declares. Given only on a FULL sync (never a
   * `--surface` subset): code-owned rows of any other surface belong to a
   * retired manifest and are archived too.
   */
  registrySurfaceNames?: readonly string[];
}

export function renderStaleArchiveStatements(
  plan: SurfaceSyncPlan,
  { skipTables = [], registrySurfaceNames }: RenderArchiveOptions = {},
): string[] {
  const surfaces = plan.surfaces.map((s) => sqlLiteral(s.name));
  if (surfaces.length === 0) return [];
  const statements: string[] = [];
  for (const [table, key] of Object.entries(plan.keys)) {
    if (!IDENT.test(table) || skipTables.includes(table)) continue;
    const declared = (plan.tables.find((t) => t.table === table)?.rows ?? []).map(
      (row) => `(${key.map((c) => sqlLiteral(row[c] ?? "")).join(", ")})`,
    );
    const tuple = `(${key.join(", ")})`;
    const scope = `declared_by = 'code' AND surface_name IN (${surfaces.join(", ")})`;
    statements.push(
      `UPDATE ${table} SET deleted_at = now() WHERE deleted_at IS NULL AND ${scope}${
        declared.length ? ` AND ${tuple} NOT IN (${declared.join(", ")})` : ""
      }`,
    );
    if (registrySurfaceNames?.length) {
      statements.push(
        `UPDATE ${table} SET deleted_at = now() WHERE deleted_at IS NULL AND declared_by = 'code' AND surface_name NOT IN (${registrySurfaceNames.map((n) => sqlLiteral(n)).join(", ")})`,
      );
    }
    if (declared.length) {
      statements.push(
        `UPDATE ${table} SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND ${scope} AND ${tuple} IN (${declared.join(", ")})`,
      );
    }
  }
  return statements;
}

export function renderStaleArchiveSql(plan: SurfaceSyncPlan, options?: RenderArchiveOptions): string {
  return renderStaleArchiveStatements(plan, options)
    .map((s) => `${s};`)
    .join("\n\n");
}
