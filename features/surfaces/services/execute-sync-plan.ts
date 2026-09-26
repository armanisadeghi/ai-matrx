/**
 * Executes `@ai-matrx/alchemy/checks`'s ONE surface sync plan through a
 * Supabase client (the admin sync route's transport). It builds no rows: every
 * row comes from `planManifestSync`. The SQL emitter renders the same plan.
 *
 * GOVERNANCE IS INSERT-ONLY (CONTRACT §2.7, ruling N5). PostgREST's upsert sets
 * every column it is sent on conflict, so for rows that already exist this
 * executor sends each insert-only column's CURRENT value (read first) — the
 * conflict then leaves organization_id / visibility exactly as they were. New
 * rows get the plan's values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@ai-matrx/data/db";
import type { Json } from "@ai-matrx/alchemy/declare";
import type { SurfaceSyncPlan, SyncTablePlan } from "@ai-matrx/alchemy/checks";
import type { Database } from "@/types/database.types";

type Sb = SupabaseClient<Database>;
type Row = Record<string, Json>;

/** The four mirror tables and ui_surface, addressed by plan name. */
interface UntypedTable {
  select(
    columns: string,
    options?: { count?: "exact" },
  ): {
    order(column: string, options: { ascending: boolean }): {
      range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: unknown; count?: number | null }>;
    };
  };
  upsert(
    rows: Row[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ): PromiseLike<{ error: unknown }> & {
    select(columns: string): PromiseLike<{ data: Row[] | null; error: unknown }>;
  };
  update(values: Row): {
    eq(column: string, value: string): { select(columns: string): PromiseLike<{ data: Row[] | null; error: unknown }> };
  };
}

function table(sb: Sb, qualified: string): UntypedTable {
  const [schema, name] = qualified.split(".");
  if (schema !== "ui" || !name) throw new Error(`Sync plan names an unexpected table "${qualified}"`);
  return (sb.schema("ui") as unknown as { from(table: string): UntypedTable }).from(name);
}

function keyOf(row: Row, columns: readonly string[]): string {
  return columns.map((column) => String(row[column] ?? "")).join("::");
}

export interface ExecutedTable {
  table: string;
  written: Row[];
}

export interface ExecuteSyncPlanResult {
  /** Surfaces inserted because no row existed. */
  insertedSurfaces: string[];
  /** Surface names whose code-owned columns were written. */
  updatedSurfaces: { name: string; update: Row }[];
  tables: ExecutedTable[];
}

async function executeTable(sb: Sb, plan: SyncTablePlan): Promise<ExecutedTable> {
  const readColumns = [...new Set([...plan.conflict, ...plan.insertOnly])].join(", ");
  const existing = await readAllRows(
    ({ from, to }) =>
      // VIEW LAW: completeness audit of the system catalog — every row is the job.
      table(sb, plan.table)
        .select(readColumns, { count: "exact" })
        .order(plan.conflict[0]!, { ascending: true })
        .range(from, to),
    { label: plan.table },
  );
  const current = new Map(existing.map((row) => [keyOf(row as Row, plan.conflict), row as Row]));
  const rows = plan.rows.map((row) => {
    const present = current.get(keyOf(row, plan.conflict));
    if (!present) return row;
    const kept: Row = { ...row };
    for (const column of plan.insertOnly) kept[column] = present[column] ?? null;
    return kept;
  });
  const result = await table(sb, plan.table)
    .upsert(rows, { onConflict: plan.conflict.join(",") })
    .select(plan.conflict.join(", "));
  if (result.error) throw result.error;
  return { table: plan.table, written: result.data ?? [] };
}

export async function executeSyncPlan(
  sb: Sb,
  plan: SurfaceSyncPlan,
  options: { existingSurfaces: ReadonlySet<string>; createMissingSurfaces: boolean },
): Promise<ExecuteSyncPlanResult> {
  const missing = plan.surfaces.filter((surface) => !options.existingSurfaces.has(surface.name));
  if (missing.length > 0 && !options.createMissingSurfaces) {
    throw new Error(
      `Surface sync refused before writing: missing registrations: ${missing
        .map((surface) => surface.name)
        .join(", ")}. Enable Create missing surfaces and sync again.`,
    );
  }
  if (missing.length > 0) {
    const inserted = await table(sb, "ui.ui_surface")
      .upsert(missing.map((surface) => surface.insert), { onConflict: "name", ignoreDuplicates: true });
    if (inserted.error) throw inserted.error;
  }
  const tables: ExecutedTable[] = [];
  for (const tablePlan of plan.tables) tables.push(await executeTable(sb, tablePlan));
  const updatedSurfaces: ExecuteSyncPlanResult["updatedSurfaces"] = [];
  for (const surface of plan.surfaces) {
    const updated = await table(sb, "ui.ui_surface").update(surface.update).eq("name", surface.name).select("name");
    if (updated.error) throw updated.error;
    if ((updated.data ?? []).length > 0) updatedSurfaces.push({ name: surface.name, update: surface.update });
  }
  return { insertedSurfaces: missing.map((surface) => surface.name), updatedSurfaces, tables };
}
