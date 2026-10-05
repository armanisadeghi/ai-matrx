/**
 * Access-gate CORE — isomorphic, no React, no browser client.
 *
 * The pure half of the P7 access primitive: the `AccessLevel` type, the
 * `ResourceAccess` shape, the ordering helpers, and `resolveResourceAccess`
 * (which takes an explicit Supabase client). Safe to import from BOTH server
 * (`requireAccess`) and client (`useAccess`) code — it pulls in neither `react`
 * nor the browser Supabase client, so it never forces a "use client" boundary or
 * leaks browser globals into a Server Component.
 *
 * Backed by the `public.get_resource_access` SECURITY DEFINER RPC — registry-
 * driven, resolving the SAME model RLS enforces (owner, grants, org, membership,
 * reachability, public). This is the UX layer; RLS is still the boundary.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type ResourceAccessClient = Pick<SupabaseClient, "rpc">;

/** The four access tiers, ordered `none < view < edit < admin`. */
export type AccessLevel = "none" | "view" | "edit" | "admin";

export interface ResourceAccess {
  /** Highest capability the current caller has on the resource. */
  level: AccessLevel;
  /** True when the caller owns the resource row (`created_by`/owner column). */
  isOwner: boolean;
  /** False when the resource id doesn't exist or the type isn't registered. */
  exists: boolean;
}

export interface ResolveResourceAccessOptions {
  /**
   * Propagate an access-RPC failure to the caller. Use this for server readers
   * that must distinguish an unavailable access service from denied access.
   */
  strict?: boolean;
}

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  admin: 3,
};

/** True when `level` meets or exceeds `required` (none < view < edit < admin). */
export function accessSatisfies(
  level: AccessLevel,
  required: AccessLevel,
): boolean {
  return ACCESS_RANK[level] >= ACCESS_RANK[required];
}

/** Convenience: can this level edit? (edit or admin). */
export function canEditAccess(level: AccessLevel): boolean {
  return accessSatisfies(level, "edit");
}

/** Convenience: can this level at least view? (view, edit, or admin). */
export function canViewAccess(level: AccessLevel): boolean {
  return accessSatisfies(level, "view");
}

export const NO_ACCESS: ResourceAccess = {
  level: "none",
  isOwner: false,
  exists: false,
};

function parseAccess(data: unknown): ResourceAccess | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const level = o.level;
    if (
      (level === "view" ||
        level === "edit" ||
        level === "admin" ||
        level === "none") &&
      typeof o.is_owner === "boolean" &&
      typeof o.exists === "boolean"
    ) {
      return {
        level,
        isOwner: o.is_owner,
        exists: o.exists,
      };
    }
  }
  return null;
}

/**
 * Resolve the current caller's access to a resource using the given Supabase
 * client (browser or SSR). By default, failures resolve to no-access. Set
 * `options.strict` when a caller must surface access-service failures instead
 * of rendering an access-denied state. Callers usually reach this via
 * `useAccess` (client) or `requireAccess`/`resolveAccess` (server) rather than
 * directly.
 */
export async function resolveResourceAccess(
  client: ResourceAccessClient,
  resourceType: string,
  resourceId: string,
  options: ResolveResourceAccessOptions = {},
): Promise<ResourceAccess> {
  if (!resourceType || !resourceId) return NO_ACCESS;
  try {
    const { data, error } = await client.rpc("get_resource_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });
    if (error) {
      if (options.strict) throw error;
      return NO_ACCESS;
    }
    const access = parseAccess(data);
    if (!access) {
      if (options.strict) {
        throw new Error("get_resource_access returned a malformed response");
      }
      return NO_ACCESS;
    }
    return access;
  } catch (error) {
    if (options.strict) throw error;
    return NO_ACCESS;
  }
}
