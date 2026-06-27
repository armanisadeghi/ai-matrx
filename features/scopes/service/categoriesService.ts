// features/scopes/service/categoriesService.ts
//
// THE SOLE CHOKEPOINT for the canonical faceted taxonomy — `platform.categories`.
//
// One table, partitioned by `dimension` (the facet), replacing the fragmented
// per-feature category systems (`shortcut_categories`, `skill.category`, the
// hardcoded INDUSTRY/DEFAULT arrays). The client has NO direct grant on
// `platform.categories`; every read/write goes through the two PUBLIC
// SECURITY-DEFINER RPCs (`cat_list` / `cat_create`) — and every call to those
// RPCs goes through THIS file. No other file is allowed to call them. Like
// `associationsService`, methods always return a `ScopesRpcResult` and NEVER
// throw.
//
// ASSIGNMENT of a category to an entity is deliberately NOT here: it reuses the
// association edge — `associationsService.add({ targetType: 'category', … })`
// via `useAssociations`. A category is the noun this file owns; the attach is
// the verb `associationsService` owns. Keeping them separate is what lets one
// category be tagged onto agents, notes, files, etc. without a per-feature
// assignment table.

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
  CategoryDimension,
  PlatformCategory,
  ScopesRpcResult,
} from "@/features/scopes/types";

// Shape of one `cat_list` row (snake_case, straight from PG).
interface CatListRow {
  id: string;
  organization_id: string | null;
  dimension: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  is_system: boolean;
  color: string | null;
  icon: string | null;
  position: number | null;
}

function toCategory(row: CatListRow): PlatformCategory {
  return {
    id: row.id,
    orgId: row.organization_id ?? null,
    dimension: row.dimension,
    name: row.name,
    slug: row.slug ?? null,
    parentId: row.parent_id ?? null,
    isSystem: !!row.is_system,
    color: row.color ?? null,
    icon: row.icon ?? null,
    position: row.position ?? null,
  };
}

// ─── service ────────────────────────────────────────────────────────

export const categoriesService = {
  // ──────────────────────────────────────────────────────────────────
  //  READ — system + my-org categories, optionally filtered to one facet.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every category visible to the caller (system + their orgs), org-filtered
   * by `iam.has_org_access` inside the RPC. Pass `dimension` to scope to one
   * facet (the common case); omit it to list across all facets. Ordered by
   * dimension, then `position`, then name.
   */
  async list(
    dimension?: CategoryDimension,
  ): Promise<ScopesRpcResult<{ categories: PlatformCategory[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("cat_list", {
        p_dimension: dimension ?? null,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as CatListRow[];
      return ok({ categories: rows.map(toCategory) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — create one org category (system categories are seeded by
  //  migration, never via this path — `cat_create` forces is_system=false).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Create an org-owned category in `dimension`. `orgId` is REQUIRED and the
   * RPC rejects callers without access to it (`cat_create` raises 42501). The
   * created row is always `is_system = false`; seeding system / global
   * categories (`orgId = null`) is a migration concern, not a client write.
   * Returns the new category id.
   */
  async create(args: {
    dimension: CategoryDimension;
    name: string;
    orgId: string;
    parentId?: string | null;
    color?: string | null;
    icon?: string | null;
    slug?: string | null;
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("cat_create", {
        p_dimension: args.dimension,
        p_name: args.name,
        p_org_id: args.orgId,
        p_parent_id: args.parentId ?? null,
        p_color: args.color ?? null,
        p_icon: args.icon ?? null,
        p_slug: args.slug ?? null,
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "cat_create returned no category id");
      }
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
