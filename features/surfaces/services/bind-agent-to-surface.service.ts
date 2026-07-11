/**
 * Canonical agent ↔ surface bind (surface-first).
 *
 * Writes ONLY through `platform.associations` via `associationsService`.
 * `agent.menu_surface` (what the context menu + PDF Widgets list read) is
 * built from those edges; `value_mappings` live in association metadata and
 * are exposed by the view for launch-time resolution.
 *
 * Do NOT call `upsertAgentSurfaceBinding` from here — that path is condemned
 * and screams on every write (see features/surfaces/FEATURE.md).
 */

import { associationsService } from "@/features/scopes/service/associationsService";
import { getSurfaceByName } from "@/features/surfaces/services/surfaces.service";
import { invalidateSurfaceBoundAgents } from "@/features/surfaces/services/surface-bound-agents.service";
import {
  isValueMappingMap,
  type ValueMappingMap,
} from "@/features/surfaces/types";
import type { MappingLayer } from "@/features/surfaces/utils/merge-value-mappings";
import type { Json } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";

export interface BindAgentToSurfaceScope {
  /** Personal bind — caller's user id. */
  userId?: string | null;
  /** Org-scoped bind — org uuid (also used as assoc orgId). */
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

export interface BindAgentToSurfaceArgs {
  agentId: string;
  surfaceName: string;
  scope: BindAgentToSurfaceScope;
  valueMappings: ValueMappingMap;
  /**
   * Org required by `assoc_add` for access checks. Prefer the explicit
   * organization scope; otherwise pass the caller's personal/active org so
   * user-tier binds still clear `iam.has_org_access`.
   */
  accessOrgId: string;
}

export interface BoundAgentSurface {
  associationId: string;
  agentId: string;
  surfaceName: string;
  surfaceId: string;
  valueMappings: ValueMappingMap;
}

type MenuSurfaceBindingRow = {
  id: string;
  agent_id: string;
  surface_name: string;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  value_mappings: unknown;
  created_at: string;
};

function tierFromScope(scope: BindAgentToSurfaceScope): string {
  if (scope.userId) return "user";
  if (scope.organizationId) return "org";
  if (scope.projectId) return "project";
  if (scope.taskId) return "task";
  return "global";
}

/**
 * Bind an agent to a surface with value mappings. Idempotent — re-binding
 * the same agent↔surface updates metadata (incl. mappings) via assoc_add's
 * ON CONFLICT DO UPDATE.
 */
export async function bindAgentToSurface(
  args: BindAgentToSurfaceArgs,
): Promise<BoundAgentSurface> {
  const { agentId, surfaceName, scope, valueMappings, accessOrgId } = args;

  if (!accessOrgId) {
    throw new Error(
      "bindAgentToSurface requires an organization for access (pick Org scope, or ensure a personal/active org is available)",
    );
  }

  const surface = await getSurfaceByName(surfaceName);
  if (!surface?.id) {
    throw new Error(`Unknown surface: ${surfaceName}`);
  }

  const metadata: Json = {
    tier: tierFromScope(scope),
    user_id: scope.userId ?? null,
    project_id: scope.projectId ?? null,
    task_id: scope.taskId ?? null,
    visibility: "internal",
    version: 1,
    value_mappings: valueMappings as unknown as Json,
    bridge: "canonical-bind-agent-to-surface",
  };

  const result = await associationsService.add({
    sourceType: "agent",
    sourceId: agentId,
    targetType: "surface",
    targetId: surface.id,
    // Explicit org from the picker (org tier) or the caller's access org
    // (personal/global). Never read passive appContextSlice here (P3).
    orgId: scope.organizationId ?? accessOrgId,
    metadata,
  });

  if (!result.ok) {
    throw new Error(result.error.message || "Failed to bind agent to surface");
  }

  invalidateSurfaceBoundAgents(surfaceName);

  return {
    associationId: result.data.id,
    agentId,
    surfaceName,
    surfaceId: surface.id,
    valueMappings,
  };
}

/**
 * Detach an agent from a surface. Associations-only — removes the
 * `agent` → `surface` edge so `agent.menu_surface` stops listing it.
 */
export async function unbindAgentFromSurface(args: {
  agentId: string;
  surfaceName: string;
}): Promise<void> {
  const { agentId, surfaceName } = args;
  const surface = await getSurfaceByName(surfaceName);
  if (!surface?.id) {
    throw new Error(`Unknown surface: ${surfaceName}`);
  }

  const result = await associationsService.remove({
    sourceType: "agent",
    sourceId: agentId,
    targetType: "surface",
    targetId: surface.id,
  });

  if (!result.ok) {
    throw new Error(
      result.error.message || "Failed to remove agent from surface",
    );
  }

  invalidateSurfaceBoundAgents(surfaceName);
}

/**
 * Launch-time mapping layers for (agent, surface), read from the
 * associations-backed `agent.menu_surface` view — NOT condemned
 * `agent.agent_surface`.
 */
export async function fetchSurfaceBindingLayersFromAssociations(
  agentId: string,
  surfaceName: string,
): Promise<MappingLayer[]> {
  const sb = createClient();
  const { data, error } = await sb
    .schema("agent")
    .from("menu_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .eq("agent_id", agentId)
    .eq("surface_name", surfaceName);

  if (error) throw error;

  const rows = (data ?? []) as unknown as MenuSurfaceBindingRow[];
  const withMappings = rows
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      organizationId: r.organization_id,
      projectId: r.project_id,
      taskId: r.task_id,
      createdAt: r.created_at,
      valueMappings: isValueMappingMap(r.value_mappings)
        ? (r.value_mappings as ValueMappingMap)
        : ({} as ValueMappingMap),
    }))
    .filter((r) => Object.keys(r.valueMappings).length > 0);

  const layers: MappingLayer[] = [];
  const globalRow = withMappings.find(
    (r) =>
      r.userId === null &&
      r.organizationId === null &&
      r.projectId === null &&
      r.taskId === null,
  );
  if (globalRow) {
    layers.push({ name: "binding:global", mappings: globalRow.valueMappings });
  }
  const orgRows = withMappings
    .filter((r) => r.organizationId !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const row of orgRows) {
    layers.push({
      name: `binding:org:${row.organizationId!.slice(0, 8)}`,
      mappings: row.valueMappings,
    });
  }
  const userRow = withMappings.find((r) => r.userId !== null);
  if (userRow) {
    layers.push({ name: "binding:user", mappings: userRow.valueMappings });
  }
  return layers;
}

/**
 * List association-backed bindings for an agent (for seed/edit UIs).
 * Shape mirrors the old AgentSurfaceBinding enough for the bind panel.
 */
export async function listAgentSurfaceBindingsFromAssociations(
  agentId: string,
): Promise<
  Array<{
    id: string;
    agentId: string;
    surfaceName: string;
    userId: string | null;
    organizationId: string | null;
    projectId: string | null;
    taskId: string | null;
    valueMappings: ValueMappingMap;
    createdAt: string;
  }>
> {
  const sb = createClient();
  const { data, error } = await sb
    .schema("agent")
    .from("menu_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as MenuSurfaceBindingRow[]).map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    surfaceName: r.surface_name,
    userId: r.user_id,
    organizationId: r.organization_id,
    projectId: r.project_id,
    taskId: r.task_id,
    valueMappings: isValueMappingMap(r.value_mappings)
      ? (r.value_mappings as ValueMappingMap)
      : {},
    createdAt: r.created_at,
  }));
}
