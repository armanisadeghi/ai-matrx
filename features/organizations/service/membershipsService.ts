// features/organizations/service/membershipsService.ts
//
// THE SOLE CHOKEPOINT for canonical membership — `iam.memberships`.
//
// This is the canonical "who belongs to this container" primitive, replacing
// the per-feature legacy junction tables (the old project-member / org-member
// shapes). The client has NO direct grant on `iam.memberships`; every
// read/write goes through the PUBLIC SECURITY-DEFINER `mbr_*` RPCs — and every
// call to those RPCs goes through THIS file. No other file is allowed to call
// them. Like `associationsService`, methods always return a `RecordsResult`
// and NEVER throw.
//
// A "container" is the thing being joined: container_type ∈ { 'project',
// 'task', ... } + container_id. Roles are 'owner' | 'admin' | 'member' and
// status is 'active' | (soft-deleted). PG rows come back snake_case; small
// `toX` helpers map them to clean camelCase.

"use client";

import { mapThrownError } from "@ai-matrx/records/core";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import { err, ok } from "@/features/scopes/service/rpcResult";
import type { RecordsResult } from "@ai-matrx/records";
import type { Json } from "@/types/database.types";

// ─── Module-scoped in-flight dedup + short TTL cache ──────────────────
//
// THE SOLE CHOKEPOINT means every feature on a page (org switcher, nav
// hierarchy tree, role checks, scopes, trash, agent-context…) independently
// calls `forUser` / `counts` on mount. Measured on production: a single page
// load fired `mbr_for_user` 3x and `mbr_count` 2x. Neither RPC's answer
// changes within a render pass, so concurrent/near-concurrent callers share
// one round-trip here — the house pattern (module-scoped
// `Map<key, Promise>` in-flight + short-TTL `Map<key, {value, expiresAt}>`)
// documented for `usePdfExtractor.fetchProcessedDocument` and
// `lib/api/broker/cache.ts`. `add` / `updateRole` / `remove` below (the only
// writers of `iam.memberships`, since this file is the sole chokepoint) drop
// the cache for the affected container type so a role change or org switch
// is never served stale.
const READ_CACHE_TTL_MS = 4_000;

/** Rows per `mbr_for_user` page — under PostgREST's 1000-row cap. */
const FOR_USER_PAGE = 500;

interface ReadCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const forUserCache = new Map<
  string,
  ReadCacheEntry<RecordsResult<{ memberships: UserMembership[] }>>
>();
const forUserInflight = new Map<
  string,
  Promise<RecordsResult<{ memberships: UserMembership[] }>>
>();

const countsCache = new Map<
  string,
  ReadCacheEntry<RecordsResult<{ counts: MemberCount[] }>>
>();
const countsInflight = new Map<
  string,
  Promise<RecordsResult<{ counts: MemberCount[] }>>
>();

function forUserKey(containerType: string): string {
  // requireUserId() already ran in the caller; the RPC is auth.uid()-scoped
  // so the container type alone is a safe cache key for the signed-in user.
  return containerType;
}

function countsKey(containerType: string, containerIds: string[]): string {
  return `${containerType}::${[...new Set(containerIds)].sort().join(",")}`;
}

/** Drop cached membership reads for `containerType` (e.g. after a write). */
function invalidateForUserCache(containerType?: string): void {
  if (!containerType) {
    forUserCache.clear();
    return;
  }
  forUserCache.delete(forUserKey(containerType));
}

/** Drop cached member counts for `containerType` (e.g. after a write). */
function invalidateCountsCache(containerType?: string): void {
  if (!containerType) {
    countsCache.clear();
    return;
  }
  for (const key of countsCache.keys()) {
    if (key.startsWith(`${containerType}::`)) countsCache.delete(key);
  }
}

// The caches are keyed by container type only (not user id) since a single
// tab is always one signed-in user — but they must still die on sign-out /
// sign-in-as-someone-else, or the next user's first read could serve the
// previous user's cached rows for up to READ_CACHE_TTL_MS.
let signOutHookInstalled = false;
function installSignOutHook(): void {
  if (signOutHookInstalled || typeof window === "undefined") return;
  signOutHookInstalled = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
      forUserCache.clear();
      countsCache.clear();
    }
  });
}
// Installed on the first cache write, never at import: an import-time subscription runs in every
// module that merely imports this file (tests mocking the client without `auth` included).

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

interface MbrListWithUsersRow extends Omit<
  MbrListRow,
  "container_type" | "updated_at" | "metadata"
> {
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
    metadata: row.metadata ?? {},
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
    updatedAt: null,
    createdBy: row.created_by ?? null,
    metadata: {} as Json,
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
  ): Promise<RecordsResult<{ members: Membership[] }>> {
    try {
      requireUserId();
      const { data, error } = await runWithSessionRetry(() =>
        supabase.rpc("mbr_list", {
          p_container_type: containerType,
          p_container_id: containerId,
        }),
      );
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      const rows = (Array.isArray(data) ? data : []) as MbrListRow[];
      return ok({ members: rows.map(toMembership) });
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
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
  ): Promise<RecordsResult<{ members: MembershipWithUser[] }>> {
    try {
      requireUserId();
      const { data, error } = await runWithSessionRetry(() =>
        supabase.rpc("mbr_list_with_users", {
          p_container_type: containerType,
          p_container_id: containerId,
        }),
      );
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      const rows = (Array.isArray(data) ? data : []) as MbrListWithUsersRow[];
      return ok({
        members: rows.map((r) => toMembershipWithUser(r, containerType)),
      });
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
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
  ): Promise<RecordsResult<{ memberships: UserMembership[] }>> {
    requireUserId();
    const key = forUserKey(containerType);

    const cached = forUserCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const pending = forUserInflight.get(key);
    if (pending) return pending;

    const request = (async (): Promise<
      RecordsResult<{ memberships: UserMembership[] }>
    > => {
      try {
        // PAGED: PostgREST caps one answer at its max-rows (1000). A person in 1,043 organizations
        // lost the last 43 — Holloway Creative never reached the picker and her own org page said
        // "You don't have access" (feedback 6f443931). Read in stable id order until a short page.
        const rows: MbrForUserRow[] = [];
        for (let from = 0; ; from += FOR_USER_PAGE) {
          const { data, error } = await runWithSessionRetry(() =>
            supabase
              .rpc("mbr_for_user", { p_container_type: containerType })
              .order("id", { ascending: true })
              .range(from, from + FOR_USER_PAGE - 1),
          );
          if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
          const page = (Array.isArray(data) ? data : []) as MbrForUserRow[];
          rows.push(...page);
          if (page.length < FOR_USER_PAGE) break;
        }
        const result = ok({ memberships: rows.map(toUserMembership) });
        // Only cache successes — a failed read must not poison retries.
        installSignOutHook();
        forUserCache.set(key, {
          value: result,
          expiresAt: Date.now() + READ_CACHE_TTL_MS,
        });
        return result;
      } catch (e) {
        return { ok: false, error: mapThrownError(e, "membershipsService") };
      } finally {
        forUserInflight.delete(key);
      }
    })();
    forUserInflight.set(key, request);
    return request;
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — every membership of an EXPLICIT user (canonical Part-0a API).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every live membership held by `userId`, optionally narrowed to one
   * `containerType`, org-filtered by RLS inside the RPC. Unlike `forUser`
   * (which is scoped to the CURRENT user via auth.uid()), this takes an
   * explicit user id — the canonical "memberships for any user" read.
   */
  async listForUser(
    userId: string,
    containerType?: string,
  ): Promise<RecordsResult<{ members: Membership[] }>> {
    try {
      requireUserId();
      const { data, error } = await runWithSessionRetry(() =>
        supabase.rpc("mbr_list_for_user", {
          p_user_id: userId,
          ...(containerType ? { p_container_type: containerType } : {}),
        }),
      );
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      const rows = (Array.isArray(data) ? data : []) as MbrListRow[];
      return ok({ members: rows.map(toMembership) });
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
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
  ): Promise<RecordsResult<{ counts: MemberCount[] }>> {
    requireUserId();
    const ids = Array.from(new Set(containerIds));
    if (ids.length === 0) return ok({ counts: [] });
    const key = countsKey(containerType, ids);

    const cached = countsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const pending = countsInflight.get(key);
    if (pending) return pending;

    const request = (async (): Promise<
      RecordsResult<{ counts: MemberCount[] }>
    > => {
      try {
        // One row per id comes back, so >1000 ids would hit PostgREST's row cap: ask in slices.
        const rows: MbrCountRow[] = [];
        for (let i = 0; i < ids.length; i += FOR_USER_PAGE) {
          const slice = ids.slice(i, i + FOR_USER_PAGE);
          const { data, error } = await runWithSessionRetry(() =>
            supabase.rpc("mbr_count", {
              p_container_type: containerType,
              p_container_ids: slice,
            }),
          );
          if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
          rows.push(...((Array.isArray(data) ? data : []) as MbrCountRow[]));
        }
        const result = ok({
          counts: rows.map((r) => ({
            containerId: r.container_id,
            memberCount: Number(r.member_count),
          })),
        });
        installSignOutHook();
        countsCache.set(key, {
          value: result,
          expiresAt: Date.now() + READ_CACHE_TTL_MS,
        });
        return result;
      } catch (e) {
        return { ok: false, error: mapThrownError(e, "membershipsService") };
      } finally {
        countsInflight.delete(key);
      }
    })();
    countsInflight.set(key, request);
    return request;
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — add a member (idempotent; reactivates a soft-deleted row).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Add `userId` to `${containerType}:${containerId}` with `role`. Idempotent
   * (reactivates a soft-deleted row + updates role/status/metadata on conflict).
   * `organizationId` is required and verified for org access by the RPC
   * (raises forbidden_org otherwise). Returns the membership id.
   */
  async add(args: {
    containerType: string;
    containerId: string;
    userId: string;
    organizationId: string;
    role?: string;
    status?: string;
    metadata?: Json;
  }): Promise<RecordsResult<{ id: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("mbr_add", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
        p_organization_id: args.organizationId,
        p_role: args.role ?? "member",
        p_status: args.status ?? "active",
        // CONVERGE: C-7 — caller-supplied metadata written with no reserved-key guard; metadata is system-only — declared 2026-09-10, Data Doctrine §3.2. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-060
        p_metadata: args.metadata ?? {},
      });
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      if (!data || typeof data !== "string") {
        return err("internal", "mbr_add returned no membership id");
      }
      invalidateForUserCache(args.containerType);
      invalidateCountsCache(args.containerType);
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — change a member's role.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Set the role of `userId` in `${containerType}:${containerId}` (canonical
   * Part-0a name). Org-checked inside the RPC.
   */
  async updateRole(args: {
    containerType: string;
    containerId: string;
    userId: string;
    role: string;
  }): Promise<RecordsResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("mbr_update_role", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
        p_role: args.role,
      });
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      invalidateForUserCache(args.containerType);
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
    }
  },

  /** @deprecated Use {@link updateRole}. Thin alias kept for existing callers. */
  async setRole(args: {
    containerType: string;
    containerId: string;
    userId: string;
    role: string;
  }): Promise<RecordsResult<null>> {
    return membershipsService.updateRole(args);
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — remove a member (soft delete).
  // ──────────────────────────────────────────────────────────────────

  /** Soft-delete the membership of `userId` in `${containerType}:${containerId}`. */
  async remove(args: {
    containerType: string;
    containerId: string;
    userId: string;
  }): Promise<RecordsResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("mbr_remove", {
        p_container_type: args.containerType,
        p_container_id: args.containerId,
        p_user_id: args.userId,
      });
      if (error) return { ok: false as const, error: mapThrownError(error, "membershipsService") };
      invalidateForUserCache(args.containerType);
      invalidateCountsCache(args.containerType);
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapThrownError(e, "membershipsService") };
    }
  },
};
