"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
export type UiClientRow = Tables["ui_client"]["Row"];
export type UiSurfaceRow = Tables["ui_surface"]["Row"];
/** A `tool_executor` row. The legacy `tl_executor_kind` was collapsed into
 *  this — executors are now first-class, not a "kind" classification. */
export type ToolExecutorRow = Tables["tool_executor"]["Row"];

export type UiClientUpsert = Tables["ui_client"]["Insert"];
export type UiSurfaceUpsert = Tables["ui_surface"]["Insert"];
export type ToolExecutorUpsert = Tables["tool_executor"]["Insert"];

const sb = () => createClient();

export async function listUiClients(): Promise<UiClientRow[]> {
  const { data, error } = await sb()
    .from("ui_client")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listUiSurfaces(): Promise<UiSurfaceRow[]> {
  const { data, error } = await sb()
    .from("ui_surface")
    .select("*")
    .order("client_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listToolExecutors(): Promise<ToolExecutorRow[]> {
  const { data, error } = await sb()
    .from("tool_executor")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Legacy alias preserved for callers that still ask for "executor kinds".
 * The concept of an "executor kind" no longer exists — executors are now
 * equal citizens. Returns the same data as listToolExecutors().
 *
 * @deprecated Use listToolExecutors() instead.
 */
export const listExecutorKinds = listToolExecutors;

export async function dependentSurfaceCount(clientName: string): Promise<number> {
  const { count, error } = await sb()
    .from("ui_surface")
    .select("name", { count: "exact", head: true })
    .eq("client_name", clientName);
  if (error) throw error;
  return count ?? 0;
}

export async function upsertUiClient(row: UiClientUpsert): Promise<UiClientRow> {
  const { data, error } = await sb()
    .from("ui_client")
    .upsert(row, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertUiSurface(row: UiSurfaceUpsert): Promise<UiSurfaceRow> {
  const { data, error } = await sb()
    .from("ui_surface")
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
    .from("tool_executor")
    .upsert(row, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** @deprecated Use upsertToolExecutor() instead. */
export const upsertExecutorKind = upsertToolExecutor;

/**
 * Soft-delete: flip is_active=false. Hard DELETE is intentionally not exposed
 * here — the lookup tables are FK targets for many rows; removing one would
 * orphan tools, surfaces, executors. Reactivate by toggling back to true.
 */
export async function setUiClientActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await sb()
    .from("ui_client")
    .update({ is_active: isActive })
    .eq("name", name);
  if (error) throw error;
}

export async function setUiSurfaceActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await sb()
    .from("ui_surface")
    .update({ is_active: isActive })
    .eq("name", name);
  if (error) throw error;
}

export async function setToolExecutorActive(
  name: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await sb()
    .from("tool_executor")
    .update({ is_active: isActive })
    .eq("name", name);
  if (error) throw error;
}

/** @deprecated Use setToolExecutorActive() instead. */
export const setExecutorKindActive = setToolExecutorActive;

// NOTE: tl_gate is gone. Gates now live in code (matrx_ai.tools.gates.*) and
// are referenced by name in tool_def.gating (jsonb array). There is no DB
// table to list/toggle gates against — that's a code-side concern. The legacy
// listGates / setGateActive / listAllGateNames exports were removed.
