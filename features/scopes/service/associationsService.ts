// features/scopes/service/associationsService.ts
//
// THE SOLE CHOKEPOINT for the unified association edge — `platform.associations`.
//
// This is the canonical attach/detach primitive for the whole app: any entity
// to any other entity, replacing scattered project_id/task_id FK tagging and
// the old per-feature M2M tables. The client has NO direct grant on
// `platform.associations`; every read/write goes through the four PUBLIC
// SECURITY-DEFINER RPCs (assoc_for_entity / assoc_add / assoc_remove /
// assoc_set_targets) — and every call to those RPCs goes through THIS file.
// No other file is allowed to call them. Like `scopesService`, methods always
// return a `ScopesRpcResult` and NEVER throw.
//
// Direction is relative to the queried entity: an edge is "outgoing" when the
// entity is the source and "incoming" when it is the target. `assoc_for_entity`
// returns BOTH in one round-trip.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  err,
  mapPgErrorPair,
  mapPgError,
  ok,
} from "@/features/scopes/service/rpcResult";
import {
  checkToken,
  checkUuid,
  checkUuidArray,
  firstError,
  normalizeEntityToken,
} from "@/features/scopes/service/associationGuards";
import type {
  AssociationEdge,
  AssociationSourceEdge,
  AssociationTargetEdge,
  AssociationTargetType,
  ScopesRpcResult,
} from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

// Shape of one `assoc_for_entity` row (snake_case, straight from PG).
interface AssocForEntityRow {
  id: string;
  direction: string;
  other_type: string;
  other_id: string;
  role: string | null;
  label: string | null;
  position: number | null;
  metadata: Json;
  organization_id: string | null;
  created_at: string;
}

function toEdge(row: AssocForEntityRow): AssociationEdge {
  return {
    id: row.id,
    // PG only ever emits 'outgoing' | 'incoming'; widen-then-narrow for TS.
    direction: row.direction === "incoming" ? "incoming" : "outgoing",
    otherType: row.other_type,
    otherId: row.other_id,
    role: row.role ?? null,
    label: row.label ?? null,
    position: row.position ?? null,
    metadata: row.metadata ?? {},
    orgId: row.organization_id ?? null,
    createdAt: row.created_at,
  };
}

// Shape of one `assoc_for_targets` row (snake_case, straight from PG).
interface AssocForTargetsRow {
  id: string;
  target_id: string;
  source_type: string;
  source_id: string;
  role: string | null;
  label: string | null;
  position: number | null;
  metadata: Json;
  organization_id: string | null;
  created_at: string;
}

function toTargetEdge(row: AssocForTargetsRow): AssociationTargetEdge {
  return {
    id: row.id,
    targetId: row.target_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    role: row.role ?? null,
    label: row.label ?? null,
    position: row.position ?? null,
    metadata: row.metadata ?? {},
    orgId: row.organization_id ?? null,
    createdAt: row.created_at,
  };
}

// Shape of one `assoc_for_sources` row (snake_case, straight from PG).
interface AssocForSourcesRow {
  id: string;
  source_id: string;
  target_type: string;
  target_id: string;
  role: string | null;
  label: string | null;
  position: number | null;
  metadata: Json;
  organization_id: string | null;
  created_at: string;
}

function toSourceEdge(row: AssocForSourcesRow): AssociationSourceEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    role: row.role ?? null,
    label: row.label ?? null,
    position: row.position ?? null,
    metadata: row.metadata ?? {},
    orgId: row.organization_id ?? null,
    createdAt: row.created_at,
  };
}

// ─── service ────────────────────────────────────────────────────────

export const associationsService = {
  // ──────────────────────────────────────────────────────────────────
  //  READ — EVERY edge touching one entity (both directions).
  // ──────────────────────────────────────────────────────────────────

  /**
   * All edges where `${type}:${id}` is either source ("outgoing") or target
   * ("incoming"), org-filtered by RLS inside the RPC. One round-trip.
   */
  async listForEntity(
    rawType: string,
    id: string,
  ): Promise<ScopesRpcResult<{ edges: AssociationEdge[] }>> {
    try {
      requireUserId();
      // Legacy-alias recovery (loud) — see normalizeEntityToken / D27.
      const type = normalizeEntityToken(rawType);
      const bad = firstError(checkToken("type", type), checkUuid("id", id));
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc("assoc_for_entity", {
        p_type: type,
        p_id: id,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as AssocForEntityRow[];
      return ok({ edges: rows.map(toEdge) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — BATCH: every INCOMING edge for many targets, one round-trip.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every edge whose target is one of `targetIds` (all the same `targetType`),
   * org-filtered by RLS inside the RPC. The batch counterpart of `listForEntity`
   * — for loading the members of MANY containers at once (e.g. a War Room room
   * plus all its threads) without N per-entity round-trips. Each row carries
   * `targetId` so callers can group results back by container.
   */
  async listForTargets(
    rawTargetType: string,
    targetIds: string[],
  ): Promise<ScopesRpcResult<{ edges: AssociationTargetEdge[] }>> {
    try {
      requireUserId();
      const targetType = normalizeEntityToken(rawTargetType);
      const ids = Array.from(new Set(targetIds));
      if (ids.length === 0) return ok({ edges: [] });
      const bad = firstError(
        checkToken("targetType", targetType),
        checkUuidArray("targetIds", ids),
      );
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc("assoc_for_targets", {
        p_target_type: targetType,
        p_target_ids: ids,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as AssocForTargetsRow[];
      return ok({ edges: rows.map(toTargetEdge) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Like {@link listForTargets}, but VISIBILITY-AWARE: an edge is returned when
   * the caller EITHER shares org access to it (identical to `listForTargets`) OR
   * can VIEW its target via the canonical row-level authorization truth
   * `iam.has_access(target, 'viewer')` — which honors `visibility='public'`/
   * `'link'`, share grants, container memberships, and reachability. A strict
   * SUPERSET of `listForTargets` access; a stranger with no grant on a private
   * target still gets nothing (see `assoc_members_visible` RPC + FOUND_DEFECTS
   * D37). Use this for reading the members of a SHAREABLE container (e.g. a
   * public/shared flashcard deck's cards) that a cross-account caller may view;
   * keep plain `listForTargets` for org-scoped tagging reads.
   */
  async listForTargetsVisible(
    rawTargetType: string,
    targetIds: string[],
  ): Promise<ScopesRpcResult<{ edges: AssociationTargetEdge[] }>> {
    try {
      requireUserId();
      const targetType = normalizeEntityToken(rawTargetType);
      const ids = Array.from(new Set(targetIds));
      if (ids.length === 0) return ok({ edges: [] });
      const bad = firstError(
        checkToken("targetType", targetType),
        checkUuidArray("targetIds", ids),
      );
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc("assoc_members_visible", {
        p_target_type: targetType,
        p_target_ids: ids,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as AssocForTargetsRow[];
      return ok({ edges: rows.map(toTargetEdge) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — BATCH: every OUTGOING edge for many sources, one round-trip.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every edge whose source is one of `sourceIds` (all the same `sourceType`),
   * org-filtered by RLS inside the RPC. The source-side counterpart of
   * `listForTargets` — for loading the targets of MANY sources at once (e.g.
   * the scope tags of every visible note/task/project row) without N
   * per-entity `assoc_for_entity` round-trips. Pass `targetType` to push the
   * target filter (e.g. `"scope"`) into the DB. Each row carries `sourceId`
   * so callers can group results back by source.
   */
  async listForSources(
    rawSourceType: string,
    sourceIds: string[],
    rawTargetType?: string,
  ): Promise<ScopesRpcResult<{ edges: AssociationSourceEdge[] }>> {
    try {
      requireUserId();
      const sourceType = normalizeEntityToken(rawSourceType);
      const targetType =
        rawTargetType != null ? normalizeEntityToken(rawTargetType) : undefined;
      const ids = Array.from(new Set(sourceIds));
      if (ids.length === 0) return ok({ edges: [] });
      const bad = firstError(
        checkToken("sourceType", sourceType),
        checkUuidArray("sourceIds", ids),
        targetType ? checkToken("targetType", targetType) : null,
      );
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc("assoc_for_sources", {
        p_source_type: sourceType,
        p_source_ids: ids,
        ...(targetType ? { p_target_type: targetType } : {}),
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as AssocForSourcesRow[];
      return ok({ edges: rows.map(toSourceEdge) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — single-edge add (idempotent).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Attach `source` → `target`. Idempotent (ON CONFLICT). When `orgId` is
   * omitted the RPC resolves org from the target for scope/scope_type/task/
   * project/category; pass `orgId` for targets that don't carry one.
   * Returns the association id.
   */
  async add(args: {
    sourceType: string;
    sourceId: string;
    targetType: AssociationTargetType;
    targetId: string;
    orgId?: string;
    label?: string;
    metadata?: Json;
    role?: string;
    position?: number;
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      // Legacy-alias recovery (loud) — see normalizeEntityToken / D27.
      const sourceType = normalizeEntityToken(args.sourceType);
      const targetType = normalizeEntityToken(args.targetType);
      const bad = firstError(
        checkToken("sourceType", sourceType),
        checkUuid("sourceId", args.sourceId),
        checkToken("targetType", targetType),
        checkUuid("targetId", args.targetId),
        args.orgId != null ? checkUuid("orgId", args.orgId) : null,
      );
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc("assoc_add", {
        p_source_type: sourceType,
        p_source_id: args.sourceId,
        p_target_type: targetType,
        p_target_id: args.targetId,
        p_org_id: args.orgId,
        p_label: args.label,
        p_metadata: args.metadata ?? {},
        p_role: args.role,
        p_position: args.position,
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "assoc_add returned no association id");
      }
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — single-edge remove.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Detach `source` → `target`. No-op if the edge doesn't exist. When `role` is
   * omitted only the role-less edge is removed (role IS NOT DISTINCT FROM null);
   * pass `role` to detach a specific typed edge (e.g. one of several card→card roles).
   */
  async remove(args: {
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    role?: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      // Legacy-alias recovery (loud) — see normalizeEntityToken / D27.
      const sourceType = normalizeEntityToken(args.sourceType);
      const targetType = normalizeEntityToken(args.targetType);
      const bad = firstError(
        checkToken("sourceType", sourceType),
        checkUuid("sourceId", args.sourceId),
        checkToken("targetType", targetType),
        checkUuid("targetId", args.targetId),
      );
      if (bad) return { ok: false, error: bad };
      const { error } = await supabase.rpc("assoc_remove", {
        p_source_type: sourceType,
        p_source_id: args.sourceId,
        p_target_type: targetType,
        p_target_id: args.targetId,
        p_role: args.role,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — replace-semantics for one target type.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Make the source's edges of `targetType` exactly equal `targetIds`
   * (adds missing, removes extras) in one transaction. The set-semantics
   * counterpart of `setEntityScopes`.
   */
  async setTargets(args: {
    sourceType: string;
    sourceId: string;
    targetType: AssociationTargetType;
    targetIds: string[];
    orgId?: string;
    role?: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      // Legacy-alias recovery (loud) — see normalizeEntityToken / D27.
      const sourceType = normalizeEntityToken(args.sourceType);
      const targetType = normalizeEntityToken(args.targetType);
      const target = Array.from(new Set(args.targetIds));
      const bad = firstError(
        checkToken("sourceType", sourceType),
        checkUuid("sourceId", args.sourceId),
        checkToken("targetType", targetType),
        checkUuidArray("targetIds", target),
        args.orgId != null ? checkUuid("orgId", args.orgId) : null,
      );
      if (bad) return { ok: false, error: bad };
      const { error } = await supabase.rpc("assoc_set_targets", {
        p_source_type: sourceType,
        p_source_id: args.sourceId,
        p_target_type: targetType,
        p_target_ids: target,
        p_org_id: args.orgId,
        p_role: args.role,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  AGENT RESOURCES — authorized container membership.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Permanently attach a resource to an agent. The dedicated RPC enforces the
   * stronger authoring contract this containment edge requires: editor access
   * to both the agent and source resource. The stored edge is
   * still the canonical platform association (`role=agent_resource`).
   */
  async addAgentResource(args: {
    agentId: string;
    sourceType: string;
    sourceId: string;
    label?: string;
    metadata?: Json;
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      const sourceType = normalizeEntityToken(args.sourceType);
      const bad = firstError(
        checkUuid("agentId", args.agentId),
        checkToken("sourceType", sourceType),
        checkUuid("sourceId", args.sourceId),
      );
      if (bad) return { ok: false, error: bad };
      const { data, error } = await supabase.rpc(
        "agent_resource_add" as never,
        {
          p_agent_id: args.agentId,
          p_source_type: sourceType,
          p_source_id: args.sourceId,
          p_label: args.label,
          p_metadata: args.metadata ?? {},
        } as never,
      );
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "agent_resource_add returned no association id");
      }
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Remove one permanent Agent Resource edge. */
  async removeAgentResource(args: {
    agentId: string;
    sourceType: string;
    sourceId: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const sourceType = normalizeEntityToken(args.sourceType);
      const bad = firstError(
        checkUuid("agentId", args.agentId),
        checkToken("sourceType", sourceType),
        checkUuid("sourceId", args.sourceId),
      );
      if (bad) return { ok: false, error: bad };
      const { error } = await supabase.rpc(
        "agent_resource_remove" as never,
        {
          p_agent_id: args.agentId,
          p_source_type: sourceType,
          p_source_id: args.sourceId,
        } as never,
      );
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — purge EVERY edge touching one entity (both directions).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Remove every edge where `${type}:${id}` is the source OR the target,
   * org-filtered inside the RPC. The deletion counterpart of `listForEntity` —
   * call it when an entity is deleted so no edge is left orphaned (a dangling
   * membership/content edge would otherwise point at a deleted entity).
   */
  async removeForEntity(
    rawType: string,
    id: string,
  ): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      // Legacy-alias recovery (loud) — see normalizeEntityToken / D27.
      const type = normalizeEntityToken(rawType);
      const bad = firstError(checkToken("type", type), checkUuid("id", id));
      if (bad) return { ok: false, error: bad };
      const { error } = await supabase.rpc("assoc_remove_for_entity", {
        p_type: type,
        p_id: id,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
