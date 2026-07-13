/**
 * Canonical agent ↔ surface binding service.
 *
 * A binding is an edge in `platform.associations` (source `agent` → target
 * `surface`), written ONLY through `associationsService`. The scope tier is
 * encoded in the edge `role` so multiple tiers per (agent, surface) coexist:
 *   binding:global | binding:u:<userId> | binding:o:<orgId>
 *   | binding:p:<projectId> | binding:t:<taskId>
 * The binding payload (`value_mappings`) plus the tier ids live in edge
 * `metadata`. Reads go through the pre-joined `agent.menu_surface` view.
 *
 * This replaced the condemned bespoke agent↔surface junction (P1–P4 — see
 * features/surfaces/FEATURE.md); that table now lives in `graveyard`.
 *
 * Launch-time layer resolution (`fetchSurfaceBindingLayers`) walks the
 * surface-inheritance chain: parent-surface layers apply first (weakest),
 * the child's own layers last — child wins per key.
 */

import { associationsService } from "@/features/scopes/service/associationsService";
import { getSurfaceByName } from "@/features/surfaces/services/surfaces.service";
import { invalidateSurfaceBoundAgents } from "@/features/surfaces/services/surface-bound-agents.service";
import { getSurfaceAncestry } from "@/features/surfaces/manifests/registry";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import {
  isValueMappingMap,
  type ValueMappingMap,
} from "@/features/surfaces/types";
import type { MappingLayer } from "@/features/surfaces/utils/merge-value-mappings";
import type { Json } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScopeInput {
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

/**
 * One binding as consumers see it. `id` is the `platform.associations`
 * edge id (also what `create_shortcut_from_agent_surface` accepts).
 */
export interface AgentSurfaceBinding {
  id: string;
  agentId: string;
  surfaceName: string;
  /** Scope tier — exactly one of these is non-null (or all null for global). */
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  valueMappings: ValueMappingMap;
  createdAt: string;
}

interface MenuSurfaceBindingRow {
  id: string;
  agent_id: string;
  surface_name: string;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  value_mappings: unknown;
  created_at: string;
  /** Tier-encoded edge role — the ONLY reliable tier signal (assoc_add stamps
   * an access org on EVERY edge, so `organization_id` alone cannot identify
   * the org tier). */
  role: string | null;
}

type BindingTier = "global" | "user" | "org" | "project" | "task";

function tierFromScope(scope: ScopeInput): BindingTier {
  if (scope.userId) return "user";
  if (scope.organizationId) return "org";
  if (scope.projectId) return "project";
  if (scope.taskId) return "task";
  return "global";
}

/** Tier-encoded edge role — the edge identity for one (agent, surface, scope). */
export function bindingRoleForScope(scope: ScopeInput): string {
  if (scope.userId) return `binding:u:${scope.userId}`;
  if (scope.organizationId) return `binding:o:${scope.organizationId}`;
  if (scope.projectId) return `binding:p:${scope.projectId}`;
  if (scope.taskId) return `binding:t:${scope.taskId}`;
  return "binding:global";
}

/**
 * Derive the mutually-exclusive tier columns from the tier-encoded edge role.
 * `organization_id` is stamped on EVERY edge by `assoc_add` (it is the assoc
 * access org), so null-ness of the hoisted columns is NOT a tier signal —
 * a global edge classified by columns alone would masquerade as an org
 * binding (wrong layer precedence, undeletable via a recomputed role).
 */
function tierScopeFromRole(
  role: string | null,
  row: MenuSurfaceBindingRow,
): ScopeInput {
  if (role === "binding:global") {
    return { userId: null, organizationId: null, projectId: null, taskId: null };
  }
  if (role?.startsWith("binding:u:")) {
    return {
      userId: role.slice("binding:u:".length),
      organizationId: null,
      projectId: null,
      taskId: null,
    };
  }
  if (role?.startsWith("binding:o:")) {
    return {
      userId: null,
      organizationId: role.slice("binding:o:".length),
      projectId: null,
      taskId: null,
    };
  }
  if (role?.startsWith("binding:p:")) {
    return {
      userId: null,
      organizationId: null,
      projectId: role.slice("binding:p:".length),
      taskId: null,
    };
  }
  if (role?.startsWith("binding:t:")) {
    return {
      userId: null,
      organizationId: null,
      projectId: null,
      taskId: role.slice("binding:t:".length),
    };
  }
  // Loud recovery: a binding edge without a tier role should not exist (the
  // cutover migration normalized all of them). Fall back to the legacy
  // column heuristic so the binding still renders, but scream.
  console.error(
    "[bind-agent-to-surface] binding edge has no tier-encoded role — falling back to column heuristic; this edge predates the cutover normalization and must be fixed",
    { id: row.id, agentId: row.agent_id, surfaceName: row.surface_name, role },
  );
  return {
    userId: row.user_id,
    organizationId: row.user_id ? null : row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
  };
}

function fromRow(row: MenuSurfaceBindingRow): AgentSurfaceBinding {
  const tier = tierScopeFromRole(row.role, row);
  return {
    id: row.id,
    agentId: row.agent_id,
    surfaceName: row.surface_name,
    userId: tier.userId ?? null,
    organizationId: tier.organizationId ?? null,
    projectId: tier.projectId ?? null,
    taskId: tier.taskId ?? null,
    valueMappings: isValueMappingMap(row.value_mappings)
      ? (row.value_mappings as ValueMappingMap)
      : {},
    createdAt: row.created_at,
  };
}

const MENU_SURFACE_COLUMNS =
  "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at, role";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface BindAgentToSurfaceScope extends ScopeInput {}

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

/**
 * Bind an agent to a surface with value mappings. Idempotent per scope tier —
 * re-binding the same (agent, surface, tier) updates metadata (incl. mappings)
 * via assoc_add's ON CONFLICT DO UPDATE on the tier-encoded role.
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
  };

  const result = await associationsService.add({
    sourceType: "agent",
    sourceId: agentId,
    targetType: "surface",
    targetId: surface.id,
    // Explicit org from the picker (org tier) or the caller's access org
    // (personal/global). Never read passive appContextSlice here (P3).
    orgId: scope.organizationId ?? accessOrgId,
    role: bindingRoleForScope(scope),
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
 * Upsert a binding for (agent, surface, scope) and return it in the standard
 * binding shape. Resolves the assoc access org from the explicit org scope or
 * the caller's personal org — never from passive active context.
 */
export async function upsertAgentSurfaceBinding(args: {
  agentId: string;
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}): Promise<AgentSurfaceBinding> {
  const { agentId, surfaceName, scope, valueMappings } = args;
  const accessOrgId = await ensureOrgId(scope.organizationId ?? null);
  const saved = await bindAgentToSurface({
    agentId,
    surfaceName,
    scope,
    valueMappings,
    accessOrgId,
  });
  return {
    id: saved.associationId,
    agentId,
    surfaceName,
    userId: scope.userId ?? null,
    organizationId: scope.organizationId ?? null,
    projectId: scope.projectId ?? null,
    taskId: scope.taskId ?? null,
    valueMappings,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Detach an agent from a surface. When `scope` is given, only that tier's
 * edge is removed; otherwise every tier edge for the pair is removed.
 */
export async function unbindAgentFromSurface(args: {
  agentId: string;
  surfaceName: string;
  scope?: ScopeInput;
}): Promise<void> {
  const { agentId, surfaceName, scope } = args;
  const surface = await getSurfaceByName(surfaceName);
  if (!surface?.id) {
    throw new Error(`Unknown surface: ${surfaceName}`);
  }

  const scopes: ScopeInput[] = scope
    ? [scope]
    : (await listAgentSurfaceBindings(agentId))
        .filter((b) => b.surfaceName === surfaceName)
        .map((b) => ({
          userId: b.userId,
          organizationId: b.organizationId,
          projectId: b.projectId,
          taskId: b.taskId,
        }));
  // Even with no listed binding, try the role-less + global edges so a
  // metadata-less legacy edge can't survive an unbind.
  const roles = new Set<string>(scopes.map(bindingRoleForScope));
  if (roles.size === 0) roles.add("binding:global");

  for (const role of roles) {
    const result = await associationsService.remove({
      sourceType: "agent",
      sourceId: agentId,
      targetType: "surface",
      targetId: surface.id,
      role,
    });
    if (!result.ok) {
      throw new Error(
        result.error.message || "Failed to remove agent from surface",
      );
    }
  }

  invalidateSurfaceBoundAgents(surfaceName);
}

/** Delete one binding by its association id. */
export async function deleteAgentSurfaceBinding(id: string): Promise<void> {
  const sb = createClient();
  const { data, error } = await sb
    .schema("agent")
    .from("menu_surface")
    .select(MENU_SURFACE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return; // already gone — idempotent
  const row = data as unknown as MenuSurfaceBindingRow;

  const surface = await getSurfaceByName(row.surface_name);
  if (!surface?.id) {
    throw new Error(`Unknown surface: ${row.surface_name}`);
  }
  const result = await associationsService.remove({
    sourceType: "agent",
    sourceId: row.agent_id,
    targetType: "surface",
    targetId: surface.id,
    // The stored role IS the edge identity — never recompute it from the
    // hoisted columns (every edge carries an access org).
    role: row.role ?? bindingRoleForScope(tierScopeFromRole(row.role, row)),
  });
  if (!result.ok) {
    throw new Error(result.error.message || "Failed to delete binding");
  }
  invalidateSurfaceBoundAgents(row.surface_name);
}

// ---------------------------------------------------------------------------
// Bulk upsert — N independent single-edge writes with per-surface reporting.
// ---------------------------------------------------------------------------

export interface BulkUpsertBindingInput {
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}

export interface BulkUpsertResult {
  succeeded: AgentSurfaceBinding[];
  failed: { surfaceName: string; error: string }[];
}

export async function bulkUpsertAgentSurfaceBindings(args: {
  agentId: string;
  bindings: BulkUpsertBindingInput[];
}): Promise<BulkUpsertResult> {
  const { agentId, bindings } = args;
  const settled = await Promise.allSettled(
    bindings.map((b) =>
      upsertAgentSurfaceBinding({
        agentId,
        surfaceName: b.surfaceName,
        scope: b.scope,
        valueMappings: b.valueMappings,
      }),
    ),
  );

  const succeeded: AgentSurfaceBinding[] = [];
  const failed: { surfaceName: string; error: string }[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      succeeded.push(outcome.value);
    } else {
      const reason = outcome.reason;
      failed.push({
        surfaceName: bindings[i].surfaceName,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });

  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** List all bindings for an agent that the caller can see (RLS-gated). */
export async function listAgentSurfaceBindings(
  agentId: string,
): Promise<AgentSurfaceBinding[]> {
  const sb = createClient();
  const { data, error } = await sb
    .schema("agent")
    .from("menu_surface")
    .select(MENU_SURFACE_COLUMNS)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as MenuSurfaceBindingRow[]).map(fromRow);
}

/**
 * Launch-time mapping layers for (agent, surface), weakest → strongest.
 *
 * Walks the surface-inheritance chain (`inheritsFrom`, root first): a parent
 * surface's binding layers apply to every child, and the child's own layers
 * override per key. Within one surface the tier order is
 * global → org rows (oldest → newest) → user.
 */
export async function fetchSurfaceBindingLayers(
  agentId: string,
  surfaceName: string,
): Promise<MappingLayer[]> {
  const chain = [...getSurfaceAncestry(surfaceName), surfaceName];

  const sb = createClient();
  const { data, error } = await sb
    .schema("agent")
    .from("menu_surface")
    .select(MENU_SURFACE_COLUMNS)
    .eq("agent_id", agentId)
    .in("surface_name", chain);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as MenuSurfaceBindingRow[])
    .map(fromRow)
    .filter((r) => Object.keys(r.valueMappings).length > 0);

  const layers: MappingLayer[] = [];
  for (const surface of chain) {
    const forSurface = rows.filter((r) => r.surfaceName === surface);
    if (forSurface.length === 0) continue;
    // Provenance names: the surface's own layers keep the historical short
    // names; inherited parent layers are prefixed so an inert/winning parent
    // layer is identifiable in diagnostics.
    const prefix = surface === surfaceName ? "" : `parent:${surface}:`;

    const globalRow = forSurface.find(
      (r) => !r.userId && !r.organizationId && !r.projectId && !r.taskId,
    );
    if (globalRow) {
      layers.push({
        name: `binding:${prefix}global`,
        mappings: globalRow.valueMappings,
      });
    }
    const orgRows = forSurface
      .filter((r) => r.organizationId !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of orgRows) {
      layers.push({
        name: `binding:${prefix}org:${row.organizationId!.slice(0, 8)}`,
        mappings: row.valueMappings,
      });
    }
    const userRow = forSurface.find((r) => r.userId !== null);
    if (userRow) {
      layers.push({
        name: `binding:${prefix}user`,
        mappings: userRow.valueMappings,
      });
    }
  }
  return layers;
}
