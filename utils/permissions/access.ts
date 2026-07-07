"use client";

/**
 * useAccess — the CLIENT half of the P7 view-vs-edit access gate.
 *
 *   const { level, isOwner, loading } = useAccess("fc_set", setId);
 *   if (!loading && level === "view") // offer duplicate-to-edit
 *
 * This is the UX layer — it decides which surface to show (view vs edit),
 * whether to offer "Make a copy", and what to disable. **RLS is still the
 * security boundary.** Server components use `requireAccess`
 * (./requireAccess) instead of this hook.
 *
 * The pure resolver + types + helpers live in `./access-core` (isomorphic, no
 * React) so the server guard can share them without a client boundary. This file
 * re-exports them for client consumers who import from `@/utils/permissions`.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveResourceAccess, NO_ACCESS, type ResourceAccess } from "./access-core";

export {
  accessSatisfies,
  canEditAccess,
  canViewAccess,
  NO_ACCESS,
  type AccessLevel,
  type ResourceAccess,
} from "./access-core";

/**
 * Resolve the current caller's access to a resource using the browser client.
 * Prefer `useAccess` in components; this is for imperative one-off checks.
 */
export async function getResourceAccess(
  resourceType: string,
  resourceId: string,
): Promise<ResourceAccess> {
  return resolveResourceAccess(
    supabase as unknown as SupabaseClient,
    resourceType,
    resourceId,
  );
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
