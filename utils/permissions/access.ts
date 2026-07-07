/**
 * useAccess / getResourceAccess — the P7 view-vs-edit access gate.
 *
 * ONE resolver for "what can THIS user do with THIS resource" as a single value:
 *   { level: 'none' | 'view' | 'edit' | 'admin', isOwner, exists, loading }
 *
 * This is the UX layer — it decides which surface to show (view vs edit),
 * whether to offer "Make a copy", and what to disable. **RLS is still the
 * security boundary**; a bypassed check here is never a privilege escalation.
 *
 * Backed by the `public.get_resource_access` SECURITY DEFINER RPC, which is
 * registry-driven and resolves the SAME model RLS enforces (owner, grants, org,
 * membership, reachability, public). Works for every shareable resource type and
 * for anonymous callers (public rows resolve to `view`), so the same primitive
 * powers the signed-out `/p/e` public viewer and the in-app gate.
 *
 * Consumers (P1–P5, flashcards, notes, …) import from `@/utils/permissions`:
 *   const { level, isOwner, loading } = useAccess("fc_set", setId);
 *   if (!loading && level === "view") // offer duplicate-to-edit
 * Server components use `requireAccess` (./requireAccess) instead.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  admin: 3,
};

/** True when `level` meets or exceeds `required` (none < view < edit < admin). */
export function accessSatisfies(level: AccessLevel, required: AccessLevel): boolean {
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

function parseAccess(data: unknown): ResourceAccess {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const level = o.level;
    if (level === "view" || level === "edit" || level === "admin" || level === "none") {
      return {
        level,
        isOwner: o.is_owner === true,
        exists: o.exists !== false,
      };
    }
  }
  return { level: "none", isOwner: false, exists: false };
}

const NO_ACCESS: ResourceAccess = { level: "none", isOwner: false, exists: false };

/**
 * Resolve the current caller's access to a resource. Isomorphic — pass a server
 * client from a Server Component (`requireAccess` does this), or omit it to use
 * the browser client. Never throws; failures resolve to no-access.
 */
export async function getResourceAccess(
  resourceType: string,
  resourceId: string,
  client: SupabaseClient = supabase as unknown as SupabaseClient,
): Promise<ResourceAccess> {
  if (!resourceType || !resourceId) return NO_ACCESS;
  try {
    const { data, error } = await client.rpc("get_resource_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });
    if (error) return NO_ACCESS;
    return parseAccess(data);
  } catch {
    return NO_ACCESS;
  }
}

/**
 * React hook: the current user's access to a resource. Re-resolves when the
 * resource identity changes. `loading` is true until the first resolution.
 *
 * The single client primitive every study tool + feature gates on. Do NOT roll a
 * bespoke owner/edit check — extend this (and the RPC) instead.
 */
export function useAccess(
  resourceType: string | undefined,
  resourceId: string | undefined,
): ResourceAccess & { loading: boolean; refresh: () => Promise<void> } {
  const [access, setAccess] = useState<ResourceAccess>(NO_ACCESS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!resourceType || !resourceId) {
      setAccess(NO_ACCESS);
      setLoading(false);
      return;
    }
    setLoading(true);
    getResourceAccess(resourceType, resourceId).then((result) => {
      if (active) {
        setAccess(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [resourceType, resourceId]);

  const refresh = async () => {
    if (!resourceType || !resourceId) return;
    setAccess(await getResourceAccess(resourceType, resourceId));
  };

  return { ...access, loading, refresh };
}
