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
import type {
  AssociationEdge,
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
  label: string | null;
  metadata: Json;
  org_id: string | null;
  created_at: string;
}

function toEdge(row: AssocForEntityRow): AssociationEdge {
  return {
    id: row.id,
    // PG only ever emits 'outgoing' | 'incoming'; widen-then-narrow for TS.
    direction: row.direction === "incoming" ? "incoming" : "outgoing",
    otherType: row.other_type,
    otherId: row.other_id,
    label: row.label ?? null,
    metadata: (row.metadata ?? {}) as Json,
    orgId: row.org_id ?? null,
    createdAt: row.created_at,
  };
}

// Shape of one `assoc_for_targets` row (snake_case, straight from PG).
interface AssocForTargetsRow {
  id: string;
  target_id: string;
  source_type: string;
  source_id: string;
  label: string | null;
  metadata: Json;
  org_id: string | null;
  created_at: string;
}

function toTargetEdge(row: AssocForTargetsRow): AssociationTargetEdge {
  return {
    id: row.id,
    targetId: row.target_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    label: row.label ?? null,
    metadata: (row.metadata ?? {}) as Json,
    orgId: row.org_id ?? null,
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
    type: string,
    id: string,
  ): Promise<ScopesRpcResult<{ edges: AssociationEdge[] }>> {
    try {
      requireUserId();
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
    targetType: string,
    targetIds: string[],
  ): Promise<ScopesRpcResult<{ edges: AssociationTargetEdge[] }>> {
    try {
      requireUserId();
      const ids = Array.from(new Set(targetIds));
      if (ids.length === 0) return ok({ edges: [] });
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
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("assoc_add", {
        p_source_type: args.sourceType,
        p_source_id: args.sourceId,
        p_target_type: args.targetType,
        p_target_id: args.targetId,
        p_org_id: args.orgId ?? null,
        p_label: args.label ?? null,
        p_metadata: args.metadata ?? {},
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

  /** Detach `source` → `target`. No-op if the edge doesn't exist. */
  async remove(args: {
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("assoc_remove", {
        p_source_type: args.sourceType,
        p_source_id: args.sourceId,
        p_target_type: args.targetType,
        p_target_id: args.targetId,
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
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const target = Array.from(new Set(args.targetIds));
      const { error } = await supabase.rpc("assoc_set_targets", {
        p_source_type: args.sourceType,
        p_source_id: args.sourceId,
        p_target_type: args.targetType,
        p_target_ids: target,
        p_org_id: args.orgId ?? null,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
