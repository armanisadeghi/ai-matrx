"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

export type ExecutorKindRow = Tables["tl_executor_kind"]["Row"];
export type ExecutorRow = Tables["tl_executor"]["Row"];
export type ToolDefRow = Tables["tl_def"]["Row"];

/** A tl_executor_kind row plus per-surface counts used in the master list. */
export interface ExecutorSurfaceWithStats extends ExecutorKindRow {
  /** Total tl_executor rows pointing at this surface (any auto_load). */
  boundCount: number;
  /** Subset where auto_load = true. */
  autoLoadCount: number;
  /** Subset where is_active = false (informational). */
  inactiveCount: number;
}

/** A tl_executor row joined to its tl_def parent — the row we render in the detail panel. */
export interface ExecutorBindingRow {
  /** tl_executor.id — primary key for the binding. */
  id: string;
  tool_id: string;
  tool_name: string | null;
  tool_category: string | null;
  tool_description: string | null;
  tool_is_active: boolean | null;
  auto_load: boolean;
  is_active: boolean;
  priority: number;
  delegated: boolean;
  function_path: string | null;
  source_app: string | null;
  updated_at: string;
}

/** A tl_def row available to bind to a surface (not yet in tl_executor for that surface). */
export interface UnboundToolRow {
  id: string;
  name: string;
  category: string | null;
  description: string;
  is_active: boolean | null;
}

const sb = () => createClient();

// ─── Master list: executor surfaces with counts ──────────────────────────────

/**
 * List every `tl_executor_kind` row plus aggregate counts of its bindings.
 *
 * Two parallel queries (kinds + all-executor-rows), then group in-memory. The
 * `tl_executor` table is small (a few hundred rows) and this avoids needing a
 * SQL RPC just for counts.
 */
export async function listExecutorSurfacesWithStats(): Promise<
  ExecutorSurfaceWithStats[]
> {
  const [kindsRes, execRes] = await Promise.all([
    sb()
      .from("tl_executor_kind")
      .select("*")
      .order("name", { ascending: true }),
    sb().from("tl_executor").select("surface, auto_load, is_active"),
  ]);
  if (kindsRes.error) throw kindsRes.error;
  if (execRes.error) throw execRes.error;

  const stats = new Map<
    string,
    { bound: number; autoLoad: number; inactive: number }
  >();
  for (const row of execRes.data ?? []) {
    const s = stats.get(row.surface) ?? { bound: 0, autoLoad: 0, inactive: 0 };
    s.bound += 1;
    if (row.auto_load) s.autoLoad += 1;
    if (!row.is_active) s.inactive += 1;
    stats.set(row.surface, s);
  }

  return (kindsRes.data ?? []).map((k) => {
    const s = stats.get(k.name) ?? { bound: 0, autoLoad: 0, inactive: 0 };
    return {
      ...k,
      boundCount: s.bound,
      autoLoadCount: s.autoLoad,
      inactiveCount: s.inactive,
    };
  });
}

// ─── Per-surface bindings ────────────────────────────────────────────────────

/** All tl_executor rows for a surface, joined to their parent tl_def row. */
export async function listBindingsForSurface(
  surface: string,
): Promise<ExecutorBindingRow[]> {
  // FK is named `tool_handlers_tool_id_fkey` (legacy — the table was renamed
  // from `tool_handlers` to `tl_executor` but the constraint name was kept).
  const { data, error } = await sb()
    .from("tl_executor")
    .select(
      "id, tool_id, auto_load, is_active, priority, delegated, function_path, source_app, updated_at, tool:tl_def!tool_handlers_tool_id_fkey(name, category, description, is_active)",
    )
    .eq("surface", surface)
    .order("priority", { ascending: true });
  if (error) throw error;

  type Joined = {
    id: string;
    tool_id: string;
    auto_load: boolean;
    is_active: boolean;
    priority: number;
    delegated: boolean;
    function_path: string | null;
    source_app: string | null;
    updated_at: string;
    tool: {
      name: string | null;
      category: string | null;
      description: string | null;
      is_active: boolean | null;
    } | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((r) => ({
    id: r.id,
    tool_id: r.tool_id,
    tool_name: r.tool?.name ?? null,
    tool_category: r.tool?.category ?? null,
    tool_description: r.tool?.description ?? null,
    tool_is_active: r.tool?.is_active ?? null,
    auto_load: r.auto_load,
    is_active: r.is_active,
    priority: r.priority,
    delegated: r.delegated,
    function_path: r.function_path,
    source_app: r.source_app,
    updated_at: r.updated_at,
  }));
}

// ─── Per-surface available (unbound) tools ───────────────────────────────────

/**
 * tl_def rows that are NOT yet bound to this surface in tl_executor.
 *
 * The catalog is ~380 rows and tl_executor is similarly small, so we fetch
 * both, build a Set of bound tool_ids, and filter client-side. Returns ALL
 * tools (active and inactive) so admins can intentionally bind inactive ones;
 * the caller can filter further if desired.
 */
export async function listUnboundToolsForSurface(
  surface: string,
): Promise<UnboundToolRow[]> {
  const [toolsRes, boundRes] = await Promise.all([
    sb()
      .from("tl_def")
      .select("id, name, category, description, is_active")
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    sb().from("tl_executor").select("tool_id").eq("surface", surface),
  ]);
  if (toolsRes.error) throw toolsRes.error;
  if (boundRes.error) throw boundRes.error;

  const boundIds = new Set((boundRes.data ?? []).map((r) => r.tool_id));
  return (toolsRes.data ?? []).filter((t) => !boundIds.has(t.id));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function addBinding(args: {
  surface: string;
  toolId: string;
  autoLoad?: boolean;
  priority?: number;
  isActive?: boolean;
}): Promise<ExecutorRow> {
  const { data, error } = await sb()
    .from("tl_executor")
    .insert({
      surface: args.surface,
      tool_id: args.toolId,
      auto_load: args.autoLoad ?? false,
      priority: args.priority ?? 100,
      is_active: args.isActive ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBinding(
  id: string,
  patch: Partial<{
    auto_load: boolean;
    is_active: boolean;
    priority: number;
  }>,
): Promise<void> {
  const { error } = await sb().from("tl_executor").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeBinding(id: string): Promise<void> {
  const { error } = await sb().from("tl_executor").delete().eq("id", id);
  if (error) throw error;
}
