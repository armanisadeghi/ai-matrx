"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  SurfaceDriftReport,
  SurfaceValue,
} from "@/features/surfaces/types";

type UiTables = Database["ui"]["Tables"];
type ToolTables = Database["tool"]["Tables"];
export type UiSurfaceRow = UiTables["ui_surface"]["Row"];
export type UiSurfaceUpsert = UiTables["ui_surface"]["Insert"];
export type UiSurfaceValueRow = UiTables["ui_surface_value"]["Row"];
export type ToolSurfaceDefaultsRow = ToolTables["surface_defaults"]["Row"];
export type ToolSurfaceDefaultsUpsert =
  ToolTables["surface_defaults"]["Insert"];

export interface SurfaceWithStats extends UiSurfaceRow {
  /**
   * Tools force-included on this surface (length of
   * `tool_surface_defaults.always_include_tools` for this surface, plus
   * tools inside any bundle in `always_include_bundles`). When 0 the
   * surface has no opinions and inherits everything from its parent chain.
   */
  toolCount: number;
  /** Number of `agx_agent_surface` rows for this surface (agents visible here). */
  agentCount: number;
  /** Number of `ui_surface_value` rows synced into DB for this surface. */
  surfaceValueCount: number;
}

const sb = () => createClient();

export async function listSurfacesWithStats(): Promise<SurfaceWithStats[]> {
  const c = sb();
  const [
    surfacesRes,
    surfaceDefaultsRes,
    bundleMembersRes,
    bundlesRes,
    agentCountsRes,
    surfaceValueCountsRes,
  ] = await Promise.all([
    c
      .schema("ui").from("ui_surface")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    c
      .schema("tool").from("surface_defaults")
      .select("surface_name, always_include_tools, always_include_bundles"),
    c.schema("tool").from("bundle_member").select("bundle_id"),
    c.schema("tool").from("bundle").select("id, name"),
    c.schema("agent").from("agent_surface").select("surface_name"),
    c.schema("ui").from("ui_surface_value").select("surface_name"),
  ]);
  if (surfacesRes.error) throw surfacesRes.error;
  if (surfaceDefaultsRes.error) throw surfaceDefaultsRes.error;
  if (bundleMembersRes.error) throw bundleMembersRes.error;
  if (bundlesRes.error) throw bundlesRes.error;
  if (agentCountsRes.error) throw agentCountsRes.error;
  if (surfaceValueCountsRes.error) throw surfaceValueCountsRes.error;

  // Bundle name → member count, so we can expand always_include_bundles.
  const bundleIdToName = new Map<string, string>();
  for (const b of bundlesRes.data ?? []) bundleIdToName.set(b.id, b.name);
  const bundleNameToMemberCount = new Map<string, number>();
  for (const m of bundleMembersRes.data ?? []) {
    const name = bundleIdToName.get(m.bundle_id);
    if (!name) continue;
    bundleNameToMemberCount.set(
      name,
      (bundleNameToMemberCount.get(name) ?? 0) + 1,
    );
  }

  const toolByName = new Map<string, number>();
  for (const row of surfaceDefaultsRes.data ?? []) {
    let count = row.always_include_tools.length;
    for (const bundleName of row.always_include_bundles) {
      count += bundleNameToMemberCount.get(bundleName) ?? 0;
    }
    toolByName.set(row.surface_name, count);
  }
  const agentByName = new Map<string, number>();
  for (const row of agentCountsRes.data ?? []) {
    agentByName.set(
      row.surface_name,
      (agentByName.get(row.surface_name) ?? 0) + 1,
    );
  }
  const valueByName = new Map<string, number>();
  for (const row of surfaceValueCountsRes.data ?? []) {
    valueByName.set(
      row.surface_name,
      (valueByName.get(row.surface_name) ?? 0) + 1,
    );
  }
  return (surfacesRes.data ?? []).map((s) => ({
    ...s,
    toolCount: toolByName.get(s.name) ?? 0,
    agentCount: agentByName.get(s.name) ?? 0,
    surfaceValueCount: valueByName.get(s.name) ?? 0,
  }));
}

export interface SurfaceOption {
  name: string;
  client_name: string;
  description: string | null;
  /** Owning executor (post-2026 refactor). Null on surfaces that inherit purely. */
  executor_name: string | null;
  /** Parent surface for inheritance chain; null at the root. */
  parent_surface_name: string | null;
}

/**
 * Lightweight surface list for pickers (the creator-panel Surface Simulator).
 * Active surfaces only, ordered by client then name — no per-surface stat
 * aggregation. Returns every surface across every client so a creator can
 * mimic anything (matrx-user / matrx-admin / matrx-public / chrome-extension).
 */
export async function listSurfaceOptions(): Promise<SurfaceOption[]> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface")
    .select("name, client_name, description, executor_name, parent_surface_name")
    .eq("is_active", true)
    .order("client_name", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SurfaceOption[];
}

/** Fetch a single surface row by exact name. Null when missing. */
export async function getSurfaceByName(
  name: string,
): Promise<UiSurfaceRow | null> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface")
    .select("*")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSurface(
  row: UiSurfaceUpsert,
): Promise<UiSurfaceRow> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSurface(
  name: string,
  patch: Partial<{
    description: string | null;
    sort_order: number;
    is_active: boolean;
    execution_mode: string;
    url_pattern: string | null;
    executor_name: string | null;
    parent_surface_name: string | null;
  }>,
): Promise<void> {
  const { error } = await sb()
    .schema("ui").from("ui_surface")
    .update(patch)
    .eq("name", name);
  if (error) throw error;
}

export async function bulkSetSurfacesActive(
  names: string[],
  isActive: boolean,
): Promise<void> {
  if (names.length === 0) return;
  const { error } = await sb()
    .schema("ui").from("ui_surface")
    .update({ is_active: isActive })
    .in("name", names);
  if (error) throw error;
}

export async function deleteSurface(name: string): Promise<void> {
  const { error } = await sb().schema("ui").from("ui_surface").delete().eq("name", name);
  if (error) throw error;
}

export async function listClientNames(): Promise<
  { name: string; description: string | null; is_active: boolean | null }[]
> {
  const { data, error } = await sb()
    .schema("ui").from("ui_client")
    .select("name, description, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createUiClient(args: {
  name: string;
  description: string | null;
  sortOrder?: number;
}): Promise<void> {
  const { error } = await sb()
    .schema("ui").from("ui_client")
    .insert({
      name: args.name,
      description: args.description,
      sort_order: args.sortOrder ?? 100,
      is_active: true,
    });
  if (error) throw error;
}

export async function bulkCreateSurfaces(
  rows: UiSurfaceUpsert[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await sb().schema("ui").from("ui_surface").insert(rows);
  if (error) throw error;
}

export async function bulkDeleteSurfaces(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const { error } = await sb().schema("ui").from("ui_surface").delete().in("name", names);
  if (error) throw error;
}

/**
 * Renames a surface in place. Backed by ON UPDATE CASCADE on the FK
 * targets (agx_agent_surface, tool_ui, ui_surface_value, tool_surface_defaults,
 * and self-FK parent_surface_name), so any references follow automatically.
 * Single UPDATE statement.
 */
export async function renameSurface(
  oldName: string,
  newName: string,
): Promise<void> {
  const { error } = await sb()
    .schema("ui").from("ui_surface")
    .update({ name: newName })
    .eq("name", oldName);
  if (error) throw error;
}

export interface SurfaceUsage {
  /**
   * Tools force-included on this surface. After the 2026 refactor, this is
   * the set of `tool_def` rows whose names appear in
   * `tool_surface_defaults.always_include_tools` for this surface — plus
   * tools resolved through `always_include_bundles`.
   */
  tools: {
    id: string;
    name: string;
    description: string;
    is_active: boolean | null;
    via: "always_include_tools" | "always_include_bundles";
    bundle_name?: string;
  }[];
  /** Agents whose agx_agent_surface row points at this surface. */
  agents: { id: string; name: string }[];
  /** tool_ui rows scoped to this surface (per-tool UI customizations). */
  uiComponents: {
    id: string;
    tool_name: string;
    display_name: string;
    is_active: boolean;
  }[];
}

export async function getSurfaceUsage(
  surfaceName: string,
): Promise<SurfaceUsage> {
  const c = sb();
  const [defaultsRes, agentsRes, uiRes] = await Promise.all([
    c
      .schema("tool").from("surface_defaults")
      .select("always_include_tools, always_include_bundles")
      .eq("surface_name", surfaceName)
      .maybeSingle(),
    c
      .schema("agent").from("agent_surface")
      .select("agent:definition(id, name)")
      .eq("surface_name", surfaceName),
    c
      .schema("tool").from("ui")
      .select("id, tool_name, display_name, is_active")
      .eq("surface_name", surfaceName)
      .order("tool_name", { ascending: true }),
  ]);
  if (defaultsRes.error) throw defaultsRes.error;
  if (agentsRes.error) throw agentsRes.error;
  if (uiRes.error) throw uiRes.error;

  // Resolve direct + bundle-included tool names.
  const includedTools: SurfaceUsage["tools"] = [];
  if (defaultsRes.data) {
    if (defaultsRes.data.always_include_tools.length > 0) {
      const { data: directTools, error } = await c
        .schema("tool").from("definition")
        .select("id, name, description, is_active")
        .in("name", defaultsRes.data.always_include_tools);
      if (error) throw error;
      for (const t of directTools ?? []) {
        includedTools.push({ ...t, via: "always_include_tools" });
      }
    }
    if (defaultsRes.data.always_include_bundles.length > 0) {
      const { data: bundleRows, error: bErr } = await c
        .schema("tool").from("bundle")
        .select(
          "name, members:bundle_member(tool:definition(id, name, description, is_active))",
        )
        .in("name", defaultsRes.data.always_include_bundles);
      if (bErr) throw bErr;
      type BundleJoin = {
        name: string;
        members:
          | {
              tool: {
                id: string;
                name: string;
                description: string;
                is_active: boolean | null;
              } | null;
            }[]
          | null;
      };
      for (const b of (bundleRows ?? []) as unknown as BundleJoin[]) {
        for (const m of b.members ?? []) {
          if (!m.tool) continue;
          includedTools.push({
            ...m.tool,
            via: "always_include_bundles",
            bundle_name: b.name,
          });
        }
      }
    }
  }
  includedTools.sort((a, b) => a.name.localeCompare(b.name));

  type AgentJoin = { agent: { id: string; name: string } | null };

  return {
    tools: includedTools,
    agents: ((agentsRes.data ?? []) as AgentJoin[])
      .map((r) => r.agent)
      .filter((a): a is NonNullable<AgentJoin["agent"]> => a !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    uiComponents: uiRes.data ?? [],
  };
}

export interface SurfaceTier {
  /** Range start, inclusive. */
  min: number;
  /** Range end, inclusive. */
  max: number;
  label: string;
  description: string;
}

export const SURFACE_TIERS: readonly SurfaceTier[] = [
  {
    min: 0,
    max: 99,
    label: "Reserved",
    description: "Reserved sort_order band",
  },
  {
    min: 100,
    max: 299,
    label: "Pages",
    description: "Top-level routes / primary destinations",
  },
  {
    min: 300,
    max: 999,
    label: "Specialized",
    description: "Power-user surfaces and secondary tools",
  },
  {
    min: 1000,
    max: 1999,
    label: "Overlays",
    description: "Modals, sheets, popout windows",
  },
  {
    min: 2000,
    max: 8999,
    label: "Editor variants",
    description: "Editor and authoring surfaces",
  },
  {
    min: 9000,
    max: Number.MAX_SAFE_INTEGER,
    label: "Debug",
    description: "Admin-only debugging overlays",
  },
];

// ============================================================
// SurfaceValue reads — DB-mirror of code-declared manifests.
// ============================================================

const VALUE_TYPES = ["string", "number", "boolean", "object", "array"] as const;
type DbValueType = (typeof VALUE_TYPES)[number];

function rowToSurfaceValue(row: UiSurfaceValueRow): SurfaceValue {
  return {
    name: row.name,
    label: row.label,
    description: row.description,
    valueType: (VALUE_TYPES.includes(row.value_type as DbValueType)
      ? (row.value_type as DbValueType)
      : "string") as SurfaceValue["valueType"],
    alwaysAvailable: row.always_available,
    typicalCharCount: row.typical_char_count,
    sortOrder: row.sort_order,
  };
}

/** List the DB-synced SurfaceValues for a single surface. */
export async function listSurfaceValues(
  surfaceName: string,
): Promise<SurfaceValue[]> {
  const { data, error } = await sb()
    .schema("ui").from("ui_surface_value")
    .select("*")
    .eq("surface_name", surfaceName)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSurfaceValue);
}

/** List the agent ↔ surface bindings for a surface (admin overview). */
export async function listAgentBindings(surfaceName: string) {
  const { data, error } = await sb()
    .schema("agent")
    .from("agent_surface")
    .select(
      "id, agent_id, user_id, organization_id, project_id, task_id, value_mappings",
    )
    .eq("surface_name", surfaceName)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Tools force-included on a surface (admin overview).
 *
 * Reads `tool_surface_defaults.always_include_tools` and joins to `tool_def`
 * by name. `arg_defaults` carries the tool-specific literal-jsonb entry from
 * `tool_surface_defaults.arg_defaults`.
 */
export async function listToolBindings(surfaceName: string) {
  const defaultsRes = await sb()
    .schema("tool").from("surface_defaults")
    .select("always_include_tools, arg_defaults")
    .eq("surface_name", surfaceName)
    .maybeSingle();
  if (defaultsRes.error) throw defaultsRes.error;
  if (!defaultsRes.data) return [];

  const argDefaultsByTool = (defaultsRes.data.arg_defaults ?? {}) as Record<
    string,
    unknown
  >;
  const toolNames = defaultsRes.data.always_include_tools;
  if (toolNames.length === 0) return [];

  const toolsRes = await sb()
    .schema("tool").from("definition")
    .select("id, name, category, is_active")
    .in("name", toolNames);
  if (toolsRes.error) throw toolsRes.error;

  return (toolsRes.data ?? []).map((t) => ({
    tool_id: t.id,
    arg_defaults: argDefaultsByTool[t.name] ?? null,
    tool_name: t.name,
    tool_category: t.category,
    tool_is_active: t.is_active,
  }));
}

/**
 * The full `tool_surface_defaults` row for a surface — null when the surface
 * has no opinions yet (no row exists until the first edit).
 */
export async function getSurfaceToolDefaults(
  surfaceName: string,
): Promise<ToolSurfaceDefaultsRow | null> {
  const { data, error } = await sb()
    .schema("tool").from("surface_defaults")
    .select("*")
    .eq("surface_name", surfaceName)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Upsert the surface's `tool_surface_defaults` row (PK = surface_name).
 * Creates the row on first edit, then patches columns in place. Returns the
 * row as persisted so editors can replace local state without a refetch.
 */
export async function upsertSurfaceToolDefaults(
  surfaceName: string,
  patch: Partial<Omit<ToolSurfaceDefaultsUpsert, "surface_name">>,
): Promise<ToolSurfaceDefaultsRow> {
  const { data, error } = await sb()
    .schema("tool").from("surface_defaults")
    .upsert(
      { surface_name: surfaceName, ...patch },
      { onConflict: "surface_name" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Calls the admin drift-report endpoint. Throws on non-2xx. */
export async function getDriftReport(): Promise<SurfaceDriftReport> {
  const res = await fetch("/api/admin/surfaces/drift-report", {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Drift report failed (${res.status})`);
  }
  const body = (await res.json()) as { report: SurfaceDriftReport };
  return body.report;
}

/** Calls the admin sync-manifests endpoint. Throws on non-2xx. */
export async function syncManifests(
  opts: {
    deleteStale?: boolean;
    createMissingSurfaces?: boolean;
  } = {},
): Promise<{
  upserted: { surfaceName: string; valueName: string }[];
  deleted: { surfaceName: string; valueName: string }[];
  roleUpserted: { surfaceName: string; roleName: string }[];
  roleDeleted: { surfaceName: string; roleName: string }[];
  sweptPrefCount: number;
  skippedMissingSurface: string[];
  driftAfter: SurfaceDriftReport;
}> {
  const res = await fetch("/api/admin/surfaces/sync-manifests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Sync manifests failed (${res.status})`);
  }
  const body = (await res.json()) as {
    result: {
      upserted: { surfaceName: string; valueName: string }[];
      deleted: { surfaceName: string; valueName: string }[];
      roleUpserted: { surfaceName: string; roleName: string }[];
      roleDeleted: { surfaceName: string; roleName: string }[];
      sweptPrefCount: number;
      skippedMissingSurface: string[];
      driftAfter: SurfaceDriftReport;
    };
  };
  return body.result;
}

/**
 * Remediation action for a single broken `surface_value` mapping. Mirror of
 * `BrokenMappingAction` in `manifest-sync.service.ts` so client code can
 * import from one place.
 */
export type BrokenMappingRemediation =
  | { action: "remap_to"; target: string }
  | { action: "remove" }
  | { action: "notify_only" };

/**
 * Apply a single remediation to a broken mapping.
 * Returns the resulting JSONB column for the modified row.
 */
export async function remediateBrokenMapping(args: {
  bindingKind: "agent";
  /** `agx_agent_surface.id`. */
  bindingId: string;
  mappingKey: string;
  remediation: BrokenMappingRemediation;
}): Promise<{
  ok: boolean;
  applied: boolean;
  newMappings: Record<string, unknown>;
}> {
  const res = await fetch("/api/admin/surfaces/remediate-mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Remediate failed (${res.status})`);
  }
  const body = (await res.json()) as {
    result: {
      ok: boolean;
      applied: boolean;
      newMappings: Record<string, unknown>;
    };
  };
  return body.result;
}

export function tierFor(sortOrder: number): SurfaceTier {
  return (
    SURFACE_TIERS.find((t) => sortOrder >= t.min && sortOrder <= t.max) ??
    SURFACE_TIERS[0]
  );
}
