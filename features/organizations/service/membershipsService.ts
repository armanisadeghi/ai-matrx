// features/organizations/service/membershipsService.ts
//
// THE SOLE CHOKEPOINT for canonical membership — `iam.memberships`.
//
// This is the canonical "who belongs to this container" primitive, replacing
// the per-feature legacy junction tables (the old project-member / org-member
// shapes). The client has NO direct grant on `iam.memberships`; every
// read/write goes through the PUBLIC SECURITY-DEFINER `mbr_*` RPCs — and every
// call to those RPCs goes through THIS file. No other file is allowed to call
// them. Like `associationsService`, methods always return a `ScopesRpcResult`
// and NEVER throw.
//
// A "container" is the thing being joined: container_type ∈ { 'project',
// 'task', ... } + container_id. Roles are 'owner' | 'admin' | 'member' and
// status is 'active' | (soft-deleted). PG rows come back snake_case; small
// `toX` helpers map them to clean camelCase.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  err,
  mapPgErrorPair,
  mapPgError,
  ok,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

// ─── Shapes ─────────────────────────────────────────────────────────

export interface Membership {
  id: string;
  organizationId: string | null;
  containerType: string;
  containerId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  createdBy: string | null;
  metadata: Json;
}

export interface MembershipWithUser extends Membership {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/** The current user's own membership (no container_type in the row). */
export interface UserMembership {
  id: string;
  organizationId: string | null;
  containerId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface MemberCount {
  containerId: string;
  memberCount: number;
}

// ─── PG row interfaces (snake_case, straight from the RPCs) ──────────

interface MbrListRow {
  id: string;
  organization_id: string | null;
  container_type: string;
  container_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  metadata: Json;
}

interface MbrListWithUsersRow
  extends Omit<MbrListRow, "container_type" | "updated_at" | "metadata"> {
  user_email: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
}

interface MbrForUserRow {
  id: string;
  organization_id: string | null;
  container_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
}

interface MbrCountRow {
  container_id: string;
  member_count: number | string;
}

function toMembership(row: MbrListRow): Membership {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    containerType: row.container_type,
    containerId: row.container_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    createdBy: row.created_by ?? null,
    metadata: (row.metadata ?? {}) as Json,
  };
}

function toMembershipWithUser(
  row: MbrListWithUsersRow,
  containerType: string,
): MembershipWithUser {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    containerType,
    containerId: row.container_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    user: {
      id: row.user_id,
      email: row.user_email ?? "",
      displayName: row.user_display_name ?? null,
      avatarUrl: row.user_avatar_url ?? null,
    },
  };
}

function toUserMembership(row: MbrForUserRow): UserMembership {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    containerId: row.container_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ─── service ────────────────────────────────────────────────────────

export const membershipsService = {
  // ──────────────────────────────────────────────────────────────────
  //  READ — every membership of one container.
  // ──────────────────────────────────────────────────────────────────

  /** All memberships of `${containerType}:${containerId}`, org-filtered by RLS. */
  async listForContainer(
    containerType: string,
    containerId: string,
  ): Promise<ScopesRpcResult<{ members: Membership[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("mbr_list", {
        p_container_type: containerType,
        p_container_id: containerId,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as MbrListRow[];
      return ok({ members: rows.map(toMembership) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — every membership of one container, joined to user profiles.
  // ──────────────────────────────────────────────────────────────────

  /**
   * All memberships of `${containerType}:${containerId}` with the joined user
   * email / display name / avatar, already ordered owner → admin → member.
   */
  async listWithUsers(
    containerType: string,
    containerId: string,
  ): Promise<ScopesRpcResult<{ members: MembershipWithUser[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("mbr_list_with_users", {
        p_container_type: containerType,
        p_container_id: containerId,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as MbrListWithUsersRow[];
      return ok({
        members: rows.map((r) => toMembershipWithUser(r, containerType)),
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — the CURRENT user's memberships of one container type.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every membership the current user holds for `containerType` (e.g. all the
   * projects they belong to). One round-trip — the canonical replacement for
   * the old per-feature "memberships for the current user" junction query.
   */
  async forUser(
    containerType: string,
  ): Promise<ScopesRpcResult<{ memberships: UserMembership[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("mbr_for_user", {
        p_container_type: containerType,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as MbrForUserRow[];
      return ok({ memberships: rows.map(toUserMembership) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — BATCH member counts for many containers, one round-trip.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Member counts for many containers at once — the batch replacement for the
   * per-container N+1 `count: 'exact'` queries. Returns only containers that
   * have at least one member; callers default missing ids to 0.
   */
  async counts(
    containerType: string,
    containerIds: string[],
  ): Promise<ScopesRpcResult<{ counts: MemberCount[] }>> {
    try {
      requireUserId();
      const ids = Array.from(new Set(containerIds));
      if (ids.length === 0) return ok({ counts: [] });
      const { data, error } = await supabase.rpc("mbr_count", {
        p_container_type: containerType,
        p_container_ids: ids,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as MbrCountRow[];
      return ok({
        counts: rows.map((r) => ({
          containerId: r.container_id,
          memberCount: Number(r.member_count),
        })),
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — add a member (idempotent; reactivates a soft-deleted row).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Add `userId` to `${containerType}:${containerId}` with `role`. Idempotent
   * (reactivates a soft-deleted row). When `orgId` is omitted the RPC resolves
   * org from the container (project/task). Returns the membership id.
   */
  async add(args: {
    containerType: string;
    containerId: string;
    userId: string;
    role?: string;
    orgId?: string | null;
    status?: string;
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("mbr_add", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
        p_role: args.role ?? "member",
        p_org_id: args.orgId ?? null,
        p_status: args.status ?? "active",
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "mbr_add returned no membership id");
      }
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — change a member's role.
  // ──────────────────────────────────────────────────────────────────

  /** Set the role of `userId` in `${containerType}:${containerId}`. */
  async setRole(args: {
    containerType: string;
    containerId: string;
    userId: string;
    role: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("mbr_set_role", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
        p_role: args.role,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — remove a member (soft delete).
  // ──────────────────────────────────────────────────────────────────

  /** Soft-delete the membership of `userId` in `${containerType}:${containerId}`. */
  async remove(args: {
    containerType: string;
    containerId: string;
    userId: string;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("mbr_remove", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
