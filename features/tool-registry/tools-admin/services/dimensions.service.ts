"use client";

/**
 * Per-tool "dimensions" — bindings (which executors run it), bundles it
 * belongs to, surfaces that force-include it, and gating policy.
 *
 * Authoritative model: see `docs/official/tool_system_rules.md`.
 */

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
type ToolTables = Database["tool"]["Tables"];

export type ToolBindingRow = ToolTables["binding"]["Row"];
export type ToolSurfaceDefaultsRow = ToolTables["surface_defaults"]["Row"];
export type ToolBundleMemberRow = ToolTables["bundle_member"]["Row"];
export type ToolBundleRow = ToolTables["bundle"]["Row"];
export type ToolDefRow = ToolTables["definition"]["Row"];

export interface BundleMembership {
  member: ToolBundleMemberRow;
  bundle: ToolBundleRow;
}

/** A surface that force-includes this tool (via `always_include_tools`). */
export interface SurfaceInclusion {
  surface_name: string;
  /** Whether the inclusion is direct (in `always_include_tools`) or via a bundle. */
  via: "always_include_tools" | "always_include_bundles";
  /** When via=always_include_bundles, the bundle name. */
  bundle_name?: string;
}

export interface ToolGateEntry {
  gate: string;
  args: Record<string, unknown>;
}

const sb = () => createClient();

// ─── Bindings ────────────────────────────────────────────────────────────────

export async function listToolBindings(toolId: string): Promise<ToolBindingRow[]> {
  const { data, error } = await sb()
    .schema("tool").from("binding")
    .select("*")
    .eq("tool_id", toolId)
    .order("executor_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addToolBinding(args: {
  toolId: string;
  executorName: string;
  isActive?: boolean;
}): Promise<ToolBindingRow> {
  const { data, error } = await sb()
    .schema("tool").from("binding")
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

export async function updateToolBinding(args: {
  toolId: string;
  executorName: string;
  isActive: boolean;
}): Promise<void> {
  const { error } = await sb()
    .schema("tool").from("binding")
    .update({ is_active: args.isActive })
    .eq("tool_id", args.toolId)
    .eq("executor_name", args.executorName);
  if (error) throw error;
}

export async function removeToolBinding(args: {
  toolId: string;
  executorName: string;
}): Promise<void> {
  const { error } = await sb()
    .schema("tool").from("binding")
    .delete()
    .eq("tool_id", args.toolId)
    .eq("executor_name", args.executorName);
  if (error) throw error;
}

// ─── Surfaces (force-inclusions from tool_surface_defaults) ──────────────────

/**
 * Find every surface that force-includes this tool — either directly via
 * `always_include_tools`, or transitively via `always_include_bundles`.
 *
 * Surfaces declare a set of tool names (and bundle names) they force-include.
 * To answer "where does this tool show up?" we scan `tool_surface_defaults`
 * looking for the tool's name in those arrays. Surfaces with no entries here
 * still resolve this tool wherever its executor bindings allow.
 */
export async function listSurfacesIncludingTool(
  toolId: string,
): Promise<SurfaceInclusion[]> {
  // Need the tool's name first — surface defaults reference tools by name, not id.
  const toolRes = await sb()
    .schema("tool").from("definition")
    .select("name")
    .eq("id", toolId)
    .single();
  if (toolRes.error) throw toolRes.error;
  const toolName = toolRes.data.name;

  const [directRes, bundleRes] = await Promise.all([
    // Direct inclusion: surface_defaults.always_include_tools contains the tool name.
    sb()
      .schema("tool").from("surface_defaults")
      .select("surface_name")
      .contains("always_include_tools", [toolName]),
    // Bundle inclusion: find bundles that contain this tool, then surfaces that include those bundles.
    sb()
      .schema("tool").from("bundle_member")
      .select("bundle:tool_bundle(name)")
      .eq("tool_id", toolId),
  ]);
  if (directRes.error) throw directRes.error;
  if (bundleRes.error) throw bundleRes.error;

  const out: SurfaceInclusion[] = (directRes.data ?? []).map((r) => ({
    surface_name: r.surface_name,
    via: "always_include_tools",
  }));

  type BundleJoin = { bundle: { name: string } | null };
  const bundleNames = ((bundleRes.data ?? []) as unknown as BundleJoin[])
    .map((r) => r.bundle?.name)
    .filter((n): n is string => Boolean(n));

  if (bundleNames.length > 0) {
    const surfacesViaBundle = await sb()
      .schema("tool").from("surface_defaults")
      .select("surface_name, always_include_bundles")
      .overlaps("always_include_bundles", bundleNames);
    if (surfacesViaBundle.error) throw surfacesViaBundle.error;
    for (const row of surfacesViaBundle.data ?? []) {
      for (const bundleName of row.always_include_bundles) {
        if (bundleNames.includes(bundleName)) {
          out.push({
            surface_name: row.surface_name,
            via: "always_include_bundles",
            bundle_name: bundleName,
          });
        }
      }
    }
  }

  return out;
}

/**
 * Add a tool to a surface's `always_include_tools` array.
 * Creates the `tool_surface_defaults` row if it doesn't yet exist.
 */
export async function addToolToSurface(args: {
  toolId: string;
  surfaceName: string;
}): Promise<void> {
  const toolRes = await sb()
    .schema("tool").from("definition")
    .select("name")
    .eq("id", args.toolId)
    .single();
  if (toolRes.error) throw toolRes.error;
  const toolName = toolRes.data.name;

  const defaultsRes = await sb()
    .schema("tool").from("surface_defaults")
    .select("always_include_tools")
    .eq("surface_name", args.surfaceName)
    .maybeSingle();
  if (defaultsRes.error) throw defaultsRes.error;

  if (defaultsRes.data) {
    if (defaultsRes.data.always_include_tools.includes(toolName)) return;
    const { error } = await sb()
      .schema("tool").from("surface_defaults")
      .update({
        always_include_tools: [...defaultsRes.data.always_include_tools, toolName],
      })
      .eq("surface_name", args.surfaceName);
    if (error) throw error;
  } else {
    const { error } = await sb()
      .schema("tool").from("surface_defaults")
      .insert({
        surface_name: args.surfaceName,
        always_include_tools: [toolName],
      });
    if (error) throw error;
  }
}

/** Remove a tool from a surface's `always_include_tools` array. */
export async function removeToolFromSurface(args: {
  toolId: string;
  surfaceName: string;
}): Promise<void> {
  const toolRes = await sb()
    .schema("tool").from("definition")
    .select("name")
    .eq("id", args.toolId)
    .single();
  if (toolRes.error) throw toolRes.error;
  const toolName = toolRes.data.name;

  const defaultsRes = await sb()
    .schema("tool").from("surface_defaults")
    .select("always_include_tools")
    .eq("surface_name", args.surfaceName)
    .maybeSingle();
  if (defaultsRes.error) throw defaultsRes.error;
  if (!defaultsRes.data) return;

  const filtered = defaultsRes.data.always_include_tools.filter((n) => n !== toolName);
  if (filtered.length === defaultsRes.data.always_include_tools.length) return;

  const { error } = await sb()
    .schema("tool").from("surface_defaults")
    .update({ always_include_tools: filtered })
    .eq("surface_name", args.surfaceName);
  if (error) throw error;
}

// ─── Bundles (reverse view) ──────────────────────────────────────────────────

export async function listToolBundleMemberships(toolId: string): Promise<BundleMembership[]> {
  const { data, error } = await sb()
    .schema("tool").from("bundle_member")
    .select("*, bundle:tool_bundle(*)")
    .eq("tool_id", toolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Joined = ToolBundleMemberRow & { bundle: ToolBundleRow | null };
  return ((data ?? []) as Joined[])
    .filter((row): row is Joined & { bundle: ToolBundleRow } => row.bundle !== null)
    .map((row) => ({
      member: {
        bundle_id: row.bundle_id,
        tool_id: row.tool_id,
        local_alias: row.local_alias,
        sort_order: row.sort_order,
        created_at: row.created_at,
      },
      bundle: row.bundle,
    }));
}

// ─── Gating (jsonb column on tool_def) ───────────────────────────────────────
//
// Gate functions live in `matrx_ai.tools.gates.*`. The DB stores only the gate
// name and arguments to pass. Per doctrine R15, gate names that don't resolve
// crash the server at startup — no fallback.

export function parseGating(gating: unknown): ToolGateEntry[] {
  if (!Array.isArray(gating)) return [];
  return gating
    .filter((g): g is { gate: string; args?: Record<string, unknown> } =>
      typeof g === "object" &&
      g !== null &&
      typeof (g as { gate?: unknown }).gate === "string",
    )
    .map((g) => ({ gate: g.gate, args: g.args ?? {} }));
}

export async function setToolGating(toolId: string, gates: ToolGateEntry[]): Promise<void> {
  const { error } = await sb()
    .schema("tool").from("definition")
    .update({ gating: gates as never })
    .eq("id", toolId);
  if (error) throw error;
}

// ─── Dependency count for soft / hard delete confirms ────────────────────────

export async function cxToolCallReferenceCount(toolName: string): Promise<number> {
  const { count, error } = await sb()
    .from("cx_tool_call")
    .select("id", { count: "exact", head: true })
    .eq("tool_name", toolName);
  if (error) throw error;
  return count ?? 0;
}

// ─── Reads for picker option lists ───────────────────────────────────────────

export async function listAllUiSurfaceNames(): Promise<string[]> {
  const { data, error } = await sb()
    .from("ui_surface")
    .select("name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.name);
}

export async function listAllExecutorNames(): Promise<string[]> {
  const { data, error } = await sb()
    .schema("tool").from("executor")
    .select("name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.name);
}

/** One row of the full tool catalog, shaped for generic search/add pickers. */
export interface ToolCatalogOption {
  id: string;
  name: string;
  category: string | null;
  description: string;
  is_active: boolean | null;
  source_kind: ToolDefRow["source_kind"];
}

/**
 * The full `tool_def` catalog (active AND inactive — callers filter) for
 * generic tool pickers, e.g. the surface tool-defaults editor.
 */
export async function listAllToolOptions(): Promise<ToolCatalogOption[]> {
  const { data, error } = await sb()
    .schema("tool").from("definition")
    .select("id, name, category, description, is_active, source_kind")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
