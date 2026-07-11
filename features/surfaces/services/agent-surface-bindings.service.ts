"use client";

import { createClient } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { getSurfaceByName } from "@/features/surfaces/services/surfaces.service";
import { invalidateSurfaceBoundAgents } from "@/features/surfaces/services/surface-bound-agents.service";
import { fetchSurfaceBindingLayersFromAssociations } from "@/features/surfaces/services/bind-agent-to-surface.service";
import {
  isValueMappingMap,
  type ValueMappingMap,
} from "@/features/surfaces/types";
import type { MappingLayer } from "@/features/surfaces/utils/merge-value-mappings";
import type { Json } from "@/types/database.types";

// =============================================================================
// ⛔️ CONDEMNED MODULE — DO NOT EXTEND. Replacement in progress.
// =============================================================================
// This service binds an AGENT to a SURFACE via the `agent.agent_surface` table.
// Nearly everything about HOW it does that violates the current canonical model
// and must be replaced — not patched. The type errors on the org/project/task
// columns are a SYMPTOM; the real defects are architectural:
//
//   (P1) FOREIGN-KEY SINGLE RELATIONSHIPS for project_id / task_id.
//        project/task are now MANY-TO-MANY across every table in the system.
//        A single FK column is the wrong shape and the underlying columns are
//        being removed. Do not write them. Do not read them as "the" project.
//
//   (P2) SINGLE scope / scope-type relationship.
//        Scopes and scope types are M2M by design. This module models "one
//        org / one scope tier per binding" — that cardinality does not exist.
//
//   (P3) ACTION CONTEXT vs USER-SELECTED CONTEXT conflation (the dangerous one).
//        Binding is a USER ACTION. The org/scope it binds to MUST come from
//        what the user EXPLICITLY selected in the UI — never from the passive,
//        cached "active context" (appContextSlice active org / scope_selections)
//        just because it happens to be loaded. See the Global-vs-Local context
//        invariant in CLAUDE.md + features/scopes/FEATURE.md. A SUCCESSFUL write
//        here is WORSE than a failure: it silently ties an agent surface to an
//        org/scope the user never intended. That is why these paths scream at
//        runtime even though TypeScript only flags some of them.
//
//   (P4) THE KICKER — wrong mechanism entirely.
//        Connecting an agent to a surface is an ASSOCIATION. It MUST go through
//        the canonical `platform.associations` system (features/scopes
//        associationsService + the canonical-associations skill), NOT a bespoke
//        per-table M2M like `agent_surface`. No new M2M relationships are
//        allowed outside canonical associations. This whole module is slated
//        for removal once the association-backed binding lands.
//
// TEMPORARY BRIDGE (2026-07-10): after every condemned `agent_surface` write we
// dual-write the same edge to `platform.associations` so `agent.menu_surface`
// (what the context menu reads) can see it. Without this bridge, binds "succeed"
// in the admin UI and never appear in any context menu. Remove the bridge when
// the write path is fully cut over to associationsService.
//
// Tracking: features/surfaces/FEATURE.md (Condemned section) + the
// canonical-associations / context-assignment skills.
// =============================================================================

/**
 * Shared loud-failure beacon. Fires on every legacy write so a broken-but-
 * "successful" binding is impossible to miss in the console AND in the
 * systemwide Error Inspector (console.error is captured as `console-error`).
 */
function reportCondemnedBindingWrite(
  op: string,
  detail: Record<string, unknown>,
): void {
  console.error(
    `[agent-surface-bindings] CONDEMNED WRITE (${op}) — this path models project/task as single FKs (P1), ` +
      `scope/scope-type as single relationships (P2), may read PASSIVE active context instead of the user's ` +
      `explicit UI selection (P3), and uses a bespoke M2M instead of canonical associations (P4). ` +
      `A successful write here can SILENTLY mis-bind an agent surface. Replace via platform.associations. ` +
      `See features/surfaces/FEATURE.md (Condemned).`,
    detail,
  );
}

const sb = () => createClient();

export interface AgentSurfaceBinding {
  id: string;
  agentId: string;
  surfaceName: string;
  /** Scope tier — exactly one of these is non-null (or all null for global). */
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  /** JSONB column. Type-guarded at read time so callers see a real ValueMappingMap. */
  valueMappings: ValueMappingMap;
  createdAt: string;
}

interface RawBindingRow {
  id: string;
  agent_id: string;
  surface_name: string;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  value_mappings: unknown;
  created_at: string;
}

/**
 * Mirror a condemned `agent_surface` row onto `platform.associations` so the
 * context menu (`agent.menu_surface`) can see it. Loud on every failure —
 * a silent dual-write miss is exactly the bug that hid bound agents.
 */
async function syncAssociationEdge(
  binding: AgentSurfaceBinding,
): Promise<void> {
  try {
    const surface = await getSurfaceByName(binding.surfaceName);
    if (!surface?.id) {
      console.error(
        "[agent-surface-bindings] ASSOCIATION DUAL-WRITE FAILED — ui_surface row missing; context menu will NOT show this agent",
        {
          agentId: binding.agentId,
          surfaceName: binding.surfaceName,
          bindingId: binding.id,
        },
      );
      return;
    }

    const tier = binding.userId
      ? "user"
      : binding.organizationId
        ? "org"
        : "global";

    const metadata: Json = {
      tier,
      user_id: binding.userId,
      project_id: binding.projectId,
      task_id: binding.taskId,
      visibility: "internal",
      version: 1,
      legacy_id: binding.id,
      legacy_table: "agent.agent_surface",
      value_mappings: binding.valueMappings as unknown as Json,
      bridge: "dual-write-from-condemned-agent-surface",
    };

    const result = await associationsService.add({
      sourceType: "agent",
      sourceId: binding.agentId,
      targetType: "surface",
      targetId: surface.id,
      orgId: binding.organizationId ?? undefined,
      metadata,
    });

    if (!result.ok) {
      console.error(
        "[agent-surface-bindings] ASSOCIATION DUAL-WRITE FAILED — agent_surface row exists but menu_surface will stay empty for this bind",
        {
          agentId: binding.agentId,
          surfaceName: binding.surfaceName,
          bindingId: binding.id,
          surfaceId: surface.id,
          error: result.error,
        },
      );
      return;
    }

    invalidateSurfaceBoundAgents(binding.surfaceName);
  } catch (err) {
    console.error(
      "[agent-surface-bindings] ASSOCIATION DUAL-WRITE THREW — context menu will NOT show this agent",
      {
        agentId: binding.agentId,
        surfaceName: binding.surfaceName,
        bindingId: binding.id,
        err,
      },
    );
  }
}

async function removeAssociationEdge(args: {
  agentId: string;
  surfaceName: string;
}): Promise<void> {
  try {
    const surface = await getSurfaceByName(args.surfaceName);
    if (!surface?.id) {
      console.error(
        "[agent-surface-bindings] ASSOCIATION DUAL-REMOVE SKIPPED — ui_surface row missing",
        args,
      );
      return;
    }
    const result = await associationsService.remove({
      sourceType: "agent",
      sourceId: args.agentId,
      targetType: "surface",
      targetId: surface.id,
    });
    if (!result.ok) {
      console.error(
        "[agent-surface-bindings] ASSOCIATION DUAL-REMOVE FAILED — menu may keep showing a deleted bind",
        { ...args, surfaceId: surface.id, error: result.error },
      );
      return;
    }
    invalidateSurfaceBoundAgents(args.surfaceName);
  } catch (err) {
    console.error("[agent-surface-bindings] ASSOCIATION DUAL-REMOVE THREW", {
      ...args,
      err,
    });
  }
}

function fromRow(row: RawBindingRow): AgentSurfaceBinding {
  return {
    id: row.id,
    agentId: row.agent_id,
    surfaceName: row.surface_name,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    valueMappings: isValueMappingMap(row.value_mappings)
      ? (row.value_mappings as ValueMappingMap)
      : {},
    createdAt: row.created_at,
  };
}

/**
 * Ordered mapping layers for (agent, surface), weakest → strongest:
 * global → org rows → user row.
 *
 * RLS is the authority on applicability: any returned row with a non-null
 * `user_id` IS the caller's own row, and any org row belongs to an org the
 * caller is a member of — so org bindings apply by MEMBERSHIP, with no
 * client-side "active org" filtering. (The previous active-org read was dead
 * code: the organizations slice never exposed `activeOrganizationId`, so the
 * org tier could never fire.) Multiple member-org rows are ordered oldest →
 * newest so the newest wins per key in the layer merge.
 */
export async function fetchSurfaceBindingLayers(
  agentId: string,
  surfaceName: string,
): Promise<MappingLayer[]> {
  // Prefer associations-backed menu_surface (canonical). Fall back to
  // condemned agent_surface only for legacy rows that never dual-wrote.
  const fromAssociations = await fetchSurfaceBindingLayersFromAssociations(
    agentId,
    surfaceName,
  );
  if (fromAssociations.length > 0) return fromAssociations;

  const { data, error } = await sb()
    .schema("agent")
    .from("agent_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .is("deleted_at", null)
    .eq("agent_id", agentId)
    .eq("surface_name", surfaceName);
  if (error) throw error;

  if ((data ?? []).length > 0) {
    // Read path is non-destructive but still legacy — warn so consumers migrate.
    console.warn(
      "[agent-surface-bindings] reading CONDEMNED agent_surface bindings — " +
        "this single-tier scope model (P1/P2) and bespoke M2M (P4) are being replaced " +
        "by canonical platform.associations. See features/surfaces/FEATURE.md (Condemned).",
    );
  }

  const rows = ((data ?? []) as unknown as RawBindingRow[]).map(fromRow);
  const withMappings = rows.filter(
    (r) => Object.keys(r.valueMappings).length > 0,
  );

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

/** List all bindings for an agent that the caller can see (RLS-gated). */
export async function listAgentSurfaceBindings(
  agentId: string,
): Promise<AgentSurfaceBinding[]> {
  const { data, error } = await sb()
    .schema("agent")
    .from("agent_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .is("deleted_at", null)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawBindingRow[]).map(fromRow);
}

export interface ScopeInput {
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

/** Upsert a binding for (agent, surface, scope). Creates if missing. */
export async function upsertAgentSurfaceBinding(args: {
  agentId: string;
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}): Promise<AgentSurfaceBinding> {
  const { agentId, surfaceName, scope, valueMappings } = args;

  // ⛔️ See the CONDEMNED MODULE banner at the top of this file (P1–P4). This
  // write models scope as a single tier and may be binding to passive context.
  reportCondemnedBindingWrite("upsertAgentSurfaceBinding", {
    agentId,
    surfaceName,
    scope,
  });

  // Find existing row matching the same (agent, surface, scope) — the partial
  // unique indexes guarantee at most one match per tier.
  const existing = await findBinding(agentId, surfaceName, scope);

  if (existing) {
    const { data, error } = await sb()
      .schema("agent")
      .from("agent_surface")
      .update({ value_mappings: valueMappings })
      .eq("id", existing.id)
      .select(
        "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
      )
      .single();
    if (error) throw error;
    const saved = fromRow(data as unknown as RawBindingRow);
    // Bridge: menu reads platform.associations via agent.menu_surface.
    await syncAssociationEdge(saved);
    return saved;
  }

  const { data, error } = await sb()
    .schema("agent")
    .from("agent_surface")
    .insert({
      agent_id: agentId,
      surface_name: surfaceName,
      user_id: scope.userId ?? null,
      // ⛔️ P2: single-scope org tier — scopes are M2M. ⛔️ P3: `scope` may be
      // sourced from passive active context, not the user's explicit selection.
      // TEMPORARY COMPILE BRIDGE (not a fix): the DB column is NOT NULL but the
      // multi-tier model needs null for non-org tiers — proof this mechanism is
      // broken (P2). Cast keeps the build green; runtime is unchanged and the
      // beacon above screams. Removed entirely when this module is replaced by
      // canonical associations (P4).
      organization_id: (scope.organizationId ?? null) as string,
      // ⛔️ P1: project_id / task_id are M2M now; these FK columns are being
      // removed. Do not write a single project/task here.
      project_id: scope.projectId ?? null,
      task_id: scope.taskId ?? null,
      value_mappings: valueMappings,
    })
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .single();
  if (error) throw error;
  const saved = fromRow(data as unknown as RawBindingRow);
  // Bridge: menu reads platform.associations via agent.menu_surface.
  await syncAssociationEdge(saved);
  return saved;
}

async function findBinding(
  agentId: string,
  surfaceName: string,
  scope: ScopeInput,
): Promise<AgentSurfaceBinding | null> {
  let query = sb()
    .schema("agent")
    .from("agent_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .eq("agent_id", agentId)
    .eq("surface_name", surfaceName);

  query =
    scope.userId !== undefined && scope.userId !== null
      ? query.eq("user_id", scope.userId)
      : query.is("user_id", null);
  query =
    scope.organizationId !== undefined && scope.organizationId !== null
      ? query.eq("organization_id", scope.organizationId)
      : query.is("organization_id", null);
  query =
    scope.projectId !== undefined && scope.projectId !== null
      ? query.eq("project_id", scope.projectId)
      : query.is("project_id", null);
  query =
    scope.taskId !== undefined && scope.taskId !== null
      ? query.eq("task_id", scope.taskId)
      : query.is("task_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fromRow(data as unknown as RawBindingRow);
}

export async function deleteAgentSurfaceBinding(id: string): Promise<void> {
  // Capture identity before delete so we can remove the association edge too.
  const { data: existing, error: lookupError } = await sb()
    .schema("agent")
    .from("agent_surface")
    .select("agent_id, surface_name")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const { error } = await sb()
    .schema("agent")
    .from("agent_surface")
    .delete()
    .eq("id", id);
  if (error) throw error;

  if (existing?.agent_id && existing?.surface_name) {
    await removeAssociationEdge({
      agentId: existing.agent_id as string,
      surfaceName: existing.surface_name as string,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch upsert
//
// One write per (agent, surface, scope) — `bulkUpsertAgentSurfaceBindings` is
// just N independent `upsertAgentSurfaceBinding` calls run concurrently, so
// each surface stays completely on its own (no cross-row mutation) and we get
// clean per-surface success/failure for partial-failure reporting.
//
// We deliberately do NOT use a single PostgREST upsert with `onConflict`: the
// uniqueness is enforced by FIVE partial unique indexes (one per scope tier),
// and `onConflict` can only name one constraint — so per-row upsert via the
// existing scope-matching `findBinding` is both simpler and correct.
// ─────────────────────────────────────────────────────────────────────────────

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
  // ⛔️ Condemned bulk path — see banner (P1–P4). Each child write also beacons.
  reportCondemnedBindingWrite("bulkUpsertAgentSurfaceBindings", {
    agentId,
    count: bindings.length,
    surfaces: bindings.map((b) => b.surfaceName),
  });
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
