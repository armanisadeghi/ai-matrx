"use client";

// =============================================================================
// Agent ↔ Surface binding — CANONICAL (platform.associations)
// =============================================================================
// The agent→surface binding is now a canonical association EDGE, not the bespoke
// `agent.agent_surface` M2M. Direction follows the association convention:
// RESOURCE=source=`agent` → CONTAINER=target=`surface` (ui.ui_surface.id). The
// old per-tier scope FK columns (P1/P2) are gone — a binding's scope is encoded
// in the edge:
//   • org tier    → the edge's `organization_id` (RLS via iam.has_org_access:
//                   a personal org keeps a user binding private; a shared org
//                   makes it member-visible — same semantics as the old RLS).
//   • which tier  → the edge `role`, which ALSO makes each tier unique under
//                   associations_unique(source,source_id,target,target_id,role):
//                     user    → 'binding:u:'||user_id
//                     org     → 'binding:o:'||organization_id
//                     project → 'binding:p:'||project_id
//                     task    → 'binding:t:'||task_id
//                     global  → 'binding:g'
//   • value_mappings + tier bookkeeping → the edge `metadata`.
//
// The scope passed to a write MUST come from the user's EXPLICIT UI selection
// (never passive appContextSlice) — the caller owns that (P3). Everything here
// goes through `associationsService` (the sole `assoc_*` chokepoint); no file
// touches `platform.associations` directly.
//
// The public API (functions + `AgentSurfaceBinding` shape) is UNCHANGED so the
// ~10 runtime/admin consumers keep working; only `id` now means the association
// id. See features/surfaces/FEATURE.md.
// =============================================================================

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import {
  isValueMappingMap,
  type ValueMappingMap,
} from "@/features/surfaces/types";
import type { MappingLayer } from "@/features/surfaces/utils/merge-value-mappings";
import type { Json } from "@/types/database.types";

const AGENT = "agent" as const;
const SURFACE = "surface" as const;

export interface AgentSurfaceBinding {
  /** The association edge id. */
  id: string;
  agentId: string;
  surfaceName: string;
  /** Scope tier — exactly one of these is non-null (or all null for global). */
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  /** Merged value-mapping payload (edge metadata). */
  valueMappings: ValueMappingMap;
  createdAt: string;
}

export interface ScopeInput {
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

// ─── surface name ↔ id resolution ────────────────────────────────────────────
// ui.ui_surface is a small (~120 row) global catalog keyed by text `name`, now
// carrying a stable `id uuid`. Association edges target that uuid, so we resolve
// both directions. Cached in-module; a miss triggers exactly one refetch (a
// newly-added surface), and a still-missing name is a hard error (loud).

let surfaceMaps: { byName: Map<string, string>; byId: Map<string, string> } | null =
  null;

async function loadSurfaceMaps(force = false): Promise<{
  byName: Map<string, string>;
  byId: Map<string, string>;
}> {
  if (surfaceMaps && !force) return surfaceMaps;
  const { data, error } = await supabase
    .schema("ui")
    .from("ui_surface")
    .select("id, name");
  if (error) throw error;
  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const row of data ?? []) {
    byName.set(row.name, row.id);
    byId.set(row.id, row.name);
  }
  surfaceMaps = { byName, byId };
  return surfaceMaps;
}

async function surfaceIdFor(surfaceName: string): Promise<string> {
  let maps = await loadSurfaceMaps();
  let id = maps.byName.get(surfaceName);
  if (!id) {
    maps = await loadSurfaceMaps(true);
    id = maps.byName.get(surfaceName);
  }
  if (!id) {
    throw new Error(
      `[agent-surface-bindings] no ui_surface row for "${surfaceName}" — cannot bind an agent to an unregistered surface`,
    );
  }
  return id;
}

async function surfaceNameFor(surfaceId: string): Promise<string | null> {
  let maps = await loadSurfaceMaps();
  let name = maps.byId.get(surfaceId);
  if (!name) {
    maps = await loadSurfaceMaps(true);
    name = maps.byId.get(surfaceId);
  }
  return name ?? null;
}

// ─── scope ↔ role encoding (mirrors the backfill migration exactly) ──────────

function roleForScope(scope: ScopeInput): string {
  if (scope.userId) return `binding:u:${scope.userId}`;
  if (scope.projectId) return `binding:p:${scope.projectId}`;
  if (scope.taskId) return `binding:t:${scope.taskId}`;
  if (scope.organizationId) return `binding:o:${scope.organizationId}`;
  return "binding:g";
}

function tierForScope(scope: ScopeInput): string {
  if (scope.userId) return "user";
  if (scope.projectId) return "project";
  if (scope.taskId) return "task";
  if (scope.organizationId) return "org";
  return "global";
}

function readValueMappings(metadata: Json): ValueMappingMap {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const vm = (metadata as Record<string, unknown>).value_mappings;
    if (isValueMappingMap(vm)) return vm;
  }
  return {};
}

function readScopeField(metadata: Json, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// ─── reads ────────────────────────────────────────────────────────────────

/**
 * Ordered mapping layers for (agent, surface), weakest → strongest:
 * global → org rows (oldest→newest) → user row. Applicability is decided by
 * association RLS (iam.has_org_access): any edge returned here is one the caller
 * is allowed to see, so we layer without client-side org filtering.
 */
export async function fetchSurfaceBindingLayers(
  agentId: string,
  surfaceName: string,
): Promise<MappingLayer[]> {
  const surfaceId = await surfaceIdFor(surfaceName);
  const res = await associationsService.listForEntity(AGENT, agentId);
  if (!res.ok) throw new Error(res.error.message);

  const edges = res.data.edges.filter(
    (e) =>
      e.direction === "outgoing" &&
      e.otherType === SURFACE &&
      e.otherId === surfaceId,
  );

  interface Row {
    userId: string | null;
    orgId: string | null;
    valueMappings: ValueMappingMap;
    createdAt: string;
  }
  const rows: Row[] = edges
    .map((e) => ({
      userId: readScopeField(e.metadata, "user_id"),
      orgId: e.orgId,
      valueMappings: readValueMappings(e.metadata),
      createdAt: e.createdAt,
    }))
    .filter((r) => Object.keys(r.valueMappings).length > 0);

  const layers: MappingLayer[] = [];

  const globalRow = rows.find((r) => r.userId === null && r.orgId === null);
  if (globalRow) {
    layers.push({ name: "binding:global", mappings: globalRow.valueMappings });
  }

  const orgRows = rows
    .filter((r) => r.userId === null && r.orgId !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const row of orgRows) {
    layers.push({
      name: `binding:org:${row.orgId!.slice(0, 8)}`,
      mappings: row.valueMappings,
    });
  }

  const userRow = rows.find((r) => r.userId !== null);
  if (userRow) {
    layers.push({ name: "binding:user", mappings: userRow.valueMappings });
  }

  return layers;
}

/** List all surface bindings for an agent the caller can see (RLS-gated). */
export async function listAgentSurfaceBindings(
  agentId: string,
): Promise<AgentSurfaceBinding[]> {
  const res = await associationsService.listForEntity(AGENT, agentId);
  if (!res.ok) throw new Error(res.error.message);

  const surfaceEdges = res.data.edges.filter(
    (e) => e.direction === "outgoing" && e.otherType === SURFACE,
  );

  const out: AgentSurfaceBinding[] = [];
  for (const e of surfaceEdges) {
    const surfaceName = await surfaceNameFor(e.otherId);
    if (!surfaceName) continue; // orphaned edge (surface deleted) — skip loudly below
    out.push({
      id: e.id,
      agentId,
      surfaceName,
      userId: readScopeField(e.metadata, "user_id"),
      organizationId: e.orgId,
      projectId: readScopeField(e.metadata, "project_id"),
      taskId: readScopeField(e.metadata, "task_id"),
      valueMappings: readValueMappings(e.metadata),
      createdAt: e.createdAt,
    });
  }
  // newest first, matching the previous ordering.
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

// ─── writes ─────────────────────────────────────────────────────────────────

/** Upsert a binding for (agent, surface, scope). Idempotent on the edge role. */
export async function upsertAgentSurfaceBinding(args: {
  agentId: string;
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}): Promise<AgentSurfaceBinding> {
  const { agentId, surfaceName, scope, valueMappings } = args;
  const surfaceId = await surfaceIdFor(surfaceName);
  const role = roleForScope(scope);

  const metadata: Json = {
    value_mappings: valueMappings as unknown as Json,
    version: 1,
    visibility: "internal",
    tier: tierForScope(scope),
    user_id: scope.userId ?? null,
    project_id: scope.projectId ?? null,
    task_id: scope.taskId ?? null,
  };

  const res = await associationsService.add({
    sourceType: AGENT,
    sourceId: agentId,
    targetType: SURFACE,
    targetId: surfaceId,
    // ui_surface carries no org — the org MUST be the user's explicit selection.
    orgId: scope.organizationId ?? undefined,
    role,
    metadata,
  });
  if (!res.ok) throw new Error(res.error.message);

  return {
    id: res.data.id,
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
 * Delete a binding. Takes the binding (not just an id) because the association
 * edge is addressed by (source, target, role) — reconstructed from the binding's
 * agent/surface/scope.
 */
export async function deleteAgentSurfaceBinding(
  binding: Pick<
    AgentSurfaceBinding,
    | "agentId"
    | "surfaceName"
    | "userId"
    | "organizationId"
    | "projectId"
    | "taskId"
  >,
): Promise<void> {
  const surfaceId = await surfaceIdFor(binding.surfaceName);
  const role = roleForScope({
    userId: binding.userId,
    organizationId: binding.organizationId,
    projectId: binding.projectId,
    taskId: binding.taskId,
  });
  const res = await associationsService.remove({
    sourceType: AGENT,
    sourceId: binding.agentId,
    targetType: SURFACE,
    targetId: surfaceId,
    role,
  });
  if (!res.ok) throw new Error(res.error.message);
}

// ─── batch upsert ────────────────────────────────────────────────────────────

export interface BulkUpsertBindingInput {
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}

export interface BulkUpsertResult {
  succeeded: AgentSurfaceBinding[];
  failed: { surfaceName: string; error: string }[];
}

/**
 * N independent single-edge upserts (one per surface), so each stays on its own
 * and we get clean per-surface success/failure reporting.
 */
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
