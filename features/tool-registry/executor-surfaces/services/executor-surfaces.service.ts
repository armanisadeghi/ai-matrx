"use client";

/**
 * Executors + Bindings service.
 *
 * See `docs/official/tool_system_rules.md` for the authoritative model. The
 * two relevant tables:
 *
 *   `tool_executor` (PK = name)     — addressable capability provider, equal
 *                                     citizen. Names like `matrx-ai-core`,
 *                                     `aidream`, `matrx-local`,
 *                                     `chrome-extension`, `matrx-user`, or
 *                                     `mcp.<slug>`. Hierarchy via
 *                                     `parent_executor_name` self-FK.
 *   `tool_binding` (PK = tool_id, executor_name) — pure M2M. Columns are
 *                  exactly: `tool_id`, `executor_name`, `is_active`,
 *                  `created_at`, `updated_at`. Doctrine R1: nothing else,
 *                  ever.
 *
 * Routing: "active executor + binding = capability." Dispatcher policy lives
 * in code (client > MCP > server). The DB does not participate in routing
 * decisions beyond presence/absence of bindings.
 */

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

export type ToolExecutorRow = Tables["tool_executor"]["Row"];
export type ToolBindingRow = Tables["tool_binding"]["Row"];
export type ToolDefRow = Tables["tool_def"]["Row"];

/** A `tool_executor` row plus aggregate counts used in the master list. */
export interface ExecutorWithStats extends ToolExecutorRow {
  /** Total `tool_binding` rows pointing at this executor (active and inactive). */
  boundCount: number;
  /** Subset where binding.is_active = false. */
  inactiveBindingCount: number;
  /** Whether this is an MCP-backed executor (has mcp_server_id). */
  isMcp: boolean;
}

/** A `tool_binding` row joined to its `tool_def` parent. */
export interface ExecutorBindingRow {
  tool_id: string;
  executor_name: string;
  tool_name: string | null;
  tool_category: string | null;
  tool_description: string | null;
  tool_is_active: boolean | null;
  tool_source_kind: ToolDefRow["source_kind"] | null;
  is_active: boolean;
  updated_at: string;
}

/** A `tool_def` row available to bind (not yet bound to this executor). */
export interface UnboundToolRow {
  id: string;
  name: string;
  category: string | null;
  description: string;
  is_active: boolean | null;
  source_kind: ToolDefRow["source_kind"];
}

const sb = () => createClient();

// ─── Master list: executors with binding counts ──────────────────────────────

/**
 * List every `tool_executor` row plus aggregate counts of its bindings.
 *
 * Two parallel queries (executors + all-bindings), then group in-memory.
 * The `tool_binding` table is small (~300 rows) and this avoids needing an
 * RPC just for counts.
 */
export async function listExecutorsWithStats(): Promise<ExecutorWithStats[]> {
  const [execRes, bindRes] = await Promise.all([
    sb().from("tool_executor").select("*").order("name", { ascending: true }),
    sb().from("tool_binding").select("executor_name, is_active"),
  ]);
  if (execRes.error) throw execRes.error;
  if (bindRes.error) throw bindRes.error;

  const stats = new Map<string, { bound: number; inactive: number }>();
  for (const row of bindRes.data ?? []) {
    const s = stats.get(row.executor_name) ?? { bound: 0, inactive: 0 };
    s.bound += 1;
    if (!row.is_active) s.inactive += 1;
    stats.set(row.executor_name, s);
  }

  return (execRes.data ?? []).map((e) => {
    const s = stats.get(e.name) ?? { bound: 0, inactive: 0 };
    return {
      ...e,
      boundCount: s.bound,
      inactiveBindingCount: s.inactive,
      isMcp: e.mcp_server_id !== null,
    };
  });
}

// ─── Per-executor bindings ───────────────────────────────────────────────────

/** All `tool_binding` rows for an executor, joined to their parent `tool_def`. */
export async function listBindingsForExecutor(
  executorName: string,
): Promise<ExecutorBindingRow[]> {
  const { data, error } = await sb()
    .from("tool_binding")
    .select(
      "tool_id, executor_name, is_active, updated_at, tool:tool_def(name, category, description, is_active, source_kind)",
    )
    .eq("executor_name", executorName)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  type Joined = {
    tool_id: string;
    executor_name: string;
    is_active: boolean;
    updated_at: string;
    tool: {
      name: string | null;
      category: string | null;
      description: string | null;
      is_active: boolean | null;
      source_kind: ToolDefRow["source_kind"] | null;
    } | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((r) => ({
    tool_id: r.tool_id,
    executor_name: r.executor_name,
    tool_name: r.tool?.name ?? null,
    tool_category: r.tool?.category ?? null,
    tool_description: r.tool?.description ?? null,
    tool_is_active: r.tool?.is_active ?? null,
    tool_source_kind: r.tool?.source_kind ?? null,
    is_active: r.is_active,
    updated_at: r.updated_at,
  }));
}

// ─── Per-executor available (unbound) tools ──────────────────────────────────

/**
 * `tool_def` rows that are NOT yet bound to this executor.
 *
 * The catalog is ~245 rows and `tool_binding` is ~300, so we fetch both,
 * build a Set of bound tool_ids, and filter client-side. Returns ALL tools
 * (active and inactive) so admins can intentionally bind inactive ones; the
 * caller can filter further if desired.
 */
export async function listUnboundToolsForExecutor(
  executorName: string,
): Promise<UnboundToolRow[]> {
  const [toolsRes, boundRes] = await Promise.all([
    sb()
      .from("tool_def")
      .select("id, name, category, description, is_active, source_kind")
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    sb().from("tool_binding").select("tool_id").eq("executor_name", executorName),
  ]);
  if (toolsRes.error) throw toolsRes.error;
  if (boundRes.error) throw boundRes.error;

  const boundIds = new Set((boundRes.data ?? []).map((r) => r.tool_id));
  return (toolsRes.data ?? []).filter((t) => !boundIds.has(t.id));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function addBinding(args: {
  executorName: string;
  toolId: string;
  isActive?: boolean;
}): Promise<ToolBindingRow> {
  const { data, error } = await sb()
    .from("tool_binding")
    .insert({
      tool_id: args.toolId,
      executor_name: args.executorName,
      is_active: args.isActive ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBinding(args: {
  toolId: string;
  executorName: string;
  isActive: boolean;
}): Promise<void> {
  const { error } = await sb()
    .from("tool_binding")
    .update({ is_active: args.isActive })
    .eq("tool_id", args.toolId)
    .eq("executor_name", args.executorName);
  if (error) throw error;
}

export async function removeBinding(args: {
  toolId: string;
  executorName: string;
}): Promise<void> {
  const { error } = await sb()
    .from("tool_binding")
    .delete()
    .eq("tool_id", args.toolId)
    .eq("executor_name", args.executorName);
  if (error) throw error;
}
