"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  SurfaceDriftReport,
  SurfaceValue,
} from "@/features/surfaces/types";

type Tables = Database["public"]["Tables"];
export type UiSurfaceRow = Tables["ui_surface"]["Row"];
export type UiSurfaceUpsert = Tables["ui_surface"]["Insert"];
export type UiSurfaceValueRow = Tables["ui_surface_value"]["Row"];

export interface SurfaceWithStats extends UiSurfaceRow {
  /** Number of `tl_def_surface` rows for this surface (tools that may appear here). */
  toolCount: number;
  /** Number of `agx_agent_surface` rows for this surface (agents visible here). */
  agentCount: number;
  /** Number of `ui_surface_value` rows synced into DB for this surface. */
  surfaceValueCount: number;
}

const sb = () => createClient();

export async function listSurfacesWithStats(): Promise<SurfaceWithStats[]> {
  const c = sb();
  const [surfacesRes, toolCountsRes, agentCountsRes, surfaceValueCountsRes] =
    await Promise.all([
      c
        .from("ui_surface")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      c.from("tl_def_surface").select("surface_name"),
      c.from("agx_agent_surface").select("surface_name"),
      c.from("ui_surface_value").select("surface_name"),
    ]);
  if (surfacesRes.error) throw surfacesRes.error;
  if (toolCountsRes.error) throw toolCountsRes.error;
  if (agentCountsRes.error) throw agentCountsRes.error;
  if (surfaceValueCountsRes.error) throw surfaceValueCountsRes.error;

  const toolByName = new Map<string, number>();
  for (const row of toolCountsRes.data ?? []) {
    toolByName.set(
      row.surface_name,
      (toolByName.get(row.surface_name) ?? 0) + 1,
    );
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
}

/**
 * Lightweight surface list for pickers (the creator-panel Surface Simulator).
 * Active surfaces only, ordered by client then name — no per-surface stat
 * aggregation. Returns every surface across every client so a creator can
 * mimic anything (matrx-user / matrx-admin / matrx-public / chrome-extension).
 */
export async function listSurfaceOptions(): Promise<SurfaceOption[]> {
  const { data, error } = await sb()
    .from("ui_surface")
    .select("name, client_name, description")
    .eq("is_active", true)
    .order("client_name", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SurfaceOption[];
}

export async function createSurface(
  row: UiSurfaceUpsert,
): Promise<UiSurfaceRow> {
  const { data, error } = await sb()
    .from("ui_surface")
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
  }>,
): Promise<void> {
  const { error } = await sb()
    .from("ui_surface")
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
    .from("ui_surface")
    .update({ is_active: isActive })
    .in("name", names);
  if (error) throw error;
}

export async function deleteSurface(name: string): Promise<void> {
  const { error } = await sb().from("ui_surface").delete().eq("name", name);
  if (error) throw error;
}

export async function listClientNames(): Promise<
  { name: string; description: string | null; is_active: boolean | null }[]
> {
  const { data, error } = await sb()
    .from("ui_client")
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
    .from("ui_client")
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
  const { error } = await sb().from("ui_surface").insert(rows);
  if (error) throw error;
}

export async function bulkDeleteSurfaces(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const { error } = await sb().from("ui_surface").delete().in("name", names);
  if (error) throw error;
}

/**
 * Renames a surface in place. Backed by ON UPDATE CASCADE on the three FK
 * targets (tl_def_surface, agx_agent_surface, tl_ui), so any references
 * follow automatically. Single UPDATE statement.
 */
export async function renameSurface(
  oldName: string,
  newName: string,
): Promise<void> {
  const { error } = await sb()
    .from("ui_surface")
    .update({ name: newName })
    .eq("name", oldName);
  if (error) throw error;
}

export interface SurfaceUsage {
  /** Tools whose tl_def_surface row points at this surface. */
  tools: {
    id: string;
    name: string;
    description: string;
    is_active: boolean | null;
  }[];
  /** Agents whose agx_agent_surface row points at this surface. */
  agents: { id: string; name: string }[];
  /** tl_ui rows scoped to this surface (per-tool UI customizations). */
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
  const [toolsRes, agentsRes, uiRes] = await Promise.all([
    c
      .from("tl_def_surface")
      .select("tool:tl_def(id, name, description, is_active)")
      .eq("surface_name", surfaceName),
    c
      .from("agx_agent_surface")
      .select("agent:agx_agent(id, name)")
      .eq("surface_name", surfaceName),
    c
      .from("tl_ui")
      .select("id, tool_name, display_name, is_active")
      .eq("surface_name", surfaceName)
      .order("tool_name", { ascending: true }),
  ]);
  if (toolsRes.error) throw toolsRes.error;
  if (agentsRes.error) throw agentsRes.error;
  if (uiRes.error) throw uiRes.error;

  type ToolJoin = {
    tool: {
      id: string;
      name: string;
      description: string;
      is_active: boolean | null;
    } | null;
  };
  type AgentJoin = { agent: { id: string; name: string } | null };

  return {
    tools: ((toolsRes.data ?? []) as ToolJoin[])
      .map((r) => r.tool)
      .filter((t): t is NonNullable<ToolJoin["tool"]> => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    .from("ui_surface_value")
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
    .from("agx_agent_surface")
    .select(
      "id, agent_id, user_id, organization_id, project_id, task_id, value_mappings",
    )
    .eq("surface_name", surfaceName)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** List the tool ↔ surface bindings for a surface (admin overview). */
export async function listToolBindings(surfaceName: string) {
  const { data, error } = await sb()
    .from("tl_def_surface")
    .select(
      "tool_id, arg_mappings, tool:tl_def!tl_def_surface_tool_id_fkey(name, category, is_active)",
    )
    .eq("surface_name", surfaceName);
  if (error) throw error;
  type Row = {
    tool_id: string;
    arg_mappings: unknown;
    tool: {
      name: string | null;
      category: string | null;
      is_active: boolean | null;
    } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    tool_id: r.tool_id,
    arg_mappings: r.arg_mappings,
    tool_name: r.tool?.name ?? null,
    tool_category: r.tool?.category ?? null,
    tool_is_active: r.tool?.is_active ?? null,
  }));
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
  bindingKind: "agent" | "tool";
  /** `agx_agent_surface.id` for agent, or `${tool_id}::${surface_name}` for tool. */
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
