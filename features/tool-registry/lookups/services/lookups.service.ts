"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type UiTables = Database["ui"]["Tables"];
type ToolTables = Database["tool"]["Tables"];
export type UiClientRow = UiTables["ui_client"]["Row"];
export type UiSurfaceRow = UiTables["ui_surface"]["Row"];
export type ToolExecutorRow = ToolTables["executor"]["Row"];

export type UiClientUpsert = UiTables["ui_client"]["Insert"];
export type UiSurfaceUpsert = UiTables["ui_surface"]["Insert"];
export type ToolExecutorUpsert = ToolTables["executor"]["Insert"];

const sb = () => createClient();

/**
 * A 0-row write under RLS is a REFUSAL, not a success — db-rules §6d: "a 0-row
 * RLS-filtered write must SCREAM, never toast success."
 *
 * `ui.ui_surface` is RLS-protected as of `migrations/ui_surface_registry_rls_d184.sql`
 * and `ui.ui_client` as of `migrations/ui_client_registry_rls.sql` (both previously had
 * RLS disabled with SIUD granted to BOTH `authenticated` and `anon`, so any visitor
 * could rewrite the registry). Both write policies are `is_admin()`, which matches this
 * page's own route gate in `app/(admin)/layout.tsx`, so anyone who can open this UI can
 * write. This guard exists so that if that ever stops being true, the user sees a real
 * error instead of a success toast over a no-op.
 */
function assertMutated(table: string, name: string, count: number | null): void {
  if (count === 0) {
    throw new Error(
      `${table}: update of "${name}" affected 0 rows — the database refused the write. ` +
        `This is an access refusal (admin rights required), not a save.`,
    );
  }
}

export async function listUiClients(): Promise<UiClientRow[]> {
  const { data, error } = await sb()
    .schema("ui").from("ui_client")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listUiSurfaces(): Promise<UiSurfaceRow[]> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface")
    .select("*")
    .order("client_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listToolExecutors(): Promise<ToolExecutorRow[]> {
  const { data, error } = await sb()
    .schema("tool").from("executor")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function dependentSurfaceCount(clientName: string): Promise<number> {
  const { count, error } = await sb()
    .schema("ui").from("ui_surface")
    .select("name", { count: "exact", head: true })
    .eq("client_name", clientName);
  if (error) throw error;
  return count ?? 0;
}

export async function upsertUiClient(row: UiClientUpsert): Promise<UiClientRow> {
  const { data, error } = await sb()
    .schema("ui").from("ui_client")
    .upsert(row, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertUiSurface(row: UiSurfaceUpsert): Promise<UiSurfaceRow> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface")
    .upsert(row, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertToolExecutor(
  row: ToolExecutorUpsert,
): Promise<ToolExecutorRow> {
  const { data, error } = await sb()
    .schema("tool").from("executor")
    .upsert(row, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft-delete: flip is_active=false. Hard DELETE is intentionally not exposed
 * here — the lookup tables are FK targets for many rows; removing one would
 * orphan tools, surfaces, executors. Reactivate by toggling back to true.
 */
export async function setUiClientActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error, count } = await sb()
    .schema("ui").from("ui_client")
    .update({ is_active: isActive }, { count: "exact" })
    .eq("name", name);
  if (error) throw error;
  assertMutated("ui.ui_client", name, count);
}

export async function setUiSurfaceActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error, count } = await sb()
    .schema("ui").from("ui_surface")
    .update({ is_active: isActive }, { count: "exact" })
    .eq("name", name);
  if (error) throw error;
  assertMutated("ui.ui_surface", name, count);
}

export async function setToolExecutorActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await sb()
    .schema("tool").from("executor")
    .update({ is_active: isActive })
    .eq("name", name);
  if (error) throw error;
}
