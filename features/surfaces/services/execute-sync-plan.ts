/**
 * Executes `@ai-matrx/alchemy/checks`'s ONE surface sync plan through a
 * Supabase client (the admin sync route's transport). It builds no rows: every
 * row comes from `planManifestSync`. The SQL emitter renders the same plan.
 *
 * GOVERNANCE IS INSERT-ONLY (CONTRACT §2.7, ruling N5), exactly as the package
 * SQL does it. PostgREST's upsert rewrites every column it is sent on conflict,
 * and a NOT NULL `organization_id` cannot be left out of an upsert, so the two
 * cases travel separately:
 *   - rows the table does not hold yet → INSERT … ON CONFLICT DO NOTHING
 *     (`ignoreDuplicates`) with the plan's governance values;
 *   - rows it holds whose code-owned columns changed → UPDATE of exactly
 *     `conflictUpdateColumns(plan)` (never a governance column), filtered by
 *     every key column.
 * Unchanged rows are not written. Provenance (`synced_by`/`synced_from`) is
 * written with a change but never counts as one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@ai-matrx/data/db";
import type { Json } from "@ai-matrx/alchemy/declare";
import {
  conflictUpdateColumns,
  type SurfaceSyncPlan,
  type SyncTablePlan,
} from "@ai-matrx/alchemy/checks";
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
      range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null; count?: number | null }>;
    };
  };
  upsert(
    rows: Row[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ): PromiseLike<{ error: unknown }> & {
    select(columns: string): PromiseLike<{ data: Row[] | null; error: unknown }>;
  };
  update(values: Row): Filtered;
}

interface Filtered {
  eq(column: string, value: Json): Filtered;
  select(columns: string): PromiseLike<{ data: Row[] | null; error: unknown }>;
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

/** Written with a content change, never a reason to write. */
const PROVENANCE = new Set(["synced_by", "synced_from"]);
const UPDATE_CONCURRENCY = 8;

function canonical(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function executeTable(sb: Sb, plan: SyncTablePlan): Promise<ExecutedTable> {
  const updateColumns = conflictUpdateColumns(plan);
  const compared = updateColumns.filter((column) => !PROVENANCE.has(column));
  const readColumns = [...new Set([...plan.conflict, ...compared])].join(", ");
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
  const fresh: Row[] = [];
  const changed: Row[] = [];
  for (const row of plan.rows) {
    const present = current.get(keyOf(row, plan.conflict));
    if (!present) fresh.push(row);
    else if (compared.some((column) => canonical(present[column]) !== canonical(row[column]))) changed.push(row);
  }

  const written: Row[] = [];
  if (fresh.length > 0) {
    const inserted = await table(sb, plan.table)
      .upsert(fresh, { onConflict: plan.conflict.join(","), ignoreDuplicates: true })
      .select(plan.conflict.join(", "));
    if (inserted.error) throw inserted.error;
    written.push(...(inserted.data ?? []));
  }
  for (let start = 0; start < changed.length; start += UPDATE_CONCURRENCY) {
    const batch = changed.slice(start, start + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((row) => {
        const values: Row = {};
        for (const column of updateColumns) if (column in row) values[column] = row[column]!;
        let query = table(sb, plan.table).update(values);
        for (const column of plan.conflict) query = query.eq(column, row[column] ?? "");
        return query.select(plan.conflict.join(", "));
      }),
    );
    for (const result of results) {
      if (result.error) throw result.error;
      written.push(...(result.data ?? []));
    }
  }
  return { table: plan.table, written };
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
