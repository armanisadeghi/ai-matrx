/**
 * The pure half of `scripts/sync-surface-manifests-direct.ts --check`: compares
 * live mirror rows to the ONE sync plan (`@ai-matrx/alchemy/checks`). Every
 * child row is addressed by its table's full plan key, so a screen value and an
 * item value that share a name are distinct rows.
 */
import type { SurfaceSyncPlan } from "@ai-matrx/alchemy/checks";

export type Row = Record<string, unknown>;

export const CHILD_TABLES = [
  ["ui_surface_value", "value"],
  ["ui_surface_agent_role", "agent role"],
  ["ui_surface_write_target", "write target"],
  ["ui_surface_client_tool", "client tool"],
] as const;

const NOT_COMPARED = new Set(["organization_id", "visibility", "synced_by", "synced_from"]);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function planRows(plan: SurfaceSyncPlan, table: string): readonly Row[] {
  return plan.tables.find((t) => t.table === `ui.${table}`)?.rows ?? [];
}

/**
 * The table's key as the plan defines it (its ON CONFLICT target). A table the
 * plan emits no rows for has no expected rows to look up, so the screen key is
 * only a placeholder there.
 */
export function planKey(plan: SurfaceSyncPlan, table: string): readonly string[] {
  return plan.tables.find((t) => t.table === `ui.${table}`)?.conflict ?? ["surface_name", "name"];
}

/** A row's key under `key`, shown as `surface::name` (screen) or `surface::item.name` (item). */
export function mirrorKey(row: Row, key: readonly string[] = ["surface_name", "item_type", "name"]): string {
  const itemType = key.includes("item_type") ? String(row.item_type ?? "") : "";
  return `${row.surface_name}::${itemType ? `${itemType}.` : ""}${row.name}`;
}

export function rowsByKey(rows: readonly Row[], key?: readonly string[]): Map<string, Row> {
  return new Map(rows.map((row) => [mirrorKey(row, key), row]));
}

export function childMetadataFailures(plan: SurfaceSyncPlan, rows: readonly Row[][]): string[] {
  const failures: string[] = [];
  CHILD_TABLES.forEach(([table], index) => {
    const tableKey = planKey(plan, table);
    const actual = rowsByKey(rows[index] ?? [], tableKey);
    for (const expected of planRows(plan, table)) {
      const key = mirrorKey(expected, tableKey);
      const row = actual.get(key);
      if (!row) continue;
      for (const [column, value] of Object.entries(expected)) {
        if (NOT_COMPARED.has(column)) continue;
        if (canonical(row[column]) !== canonical(value)) failures.push(`${key}: ${column} differs`);
      }
    }
  });
  return failures;
}
