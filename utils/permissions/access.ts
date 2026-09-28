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
 * React) so the server guard can share them without a client boundary. Import
 * helpers from `./access-core` when you need them outside this hook.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  resolveResourceAccess,
  NO_ACCESS,
  type ResourceAccess,
} from "./access-core";

// Pure types + helpers (AccessLevel, accessSatisfies, canEditAccess, …) live in
// ./access-core — import them from there.

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
  // Loading only while there's something to resolve; lazy init avoids a
  // synchronous setState in the effect (react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(resourceType && resourceId),
  );
  // A persisted Redux identity can briefly precede the browser Supabase
  // client's own restored session: firing get_resource_access before it
  // settles sends the request as `anon`, and the non-strict resolver above
  // turns that failure into NO_ACCESS — `exists: false`, not "unknown" — so a
  // resource the caller genuinely owns briefly reads as "does not exist" on
  // first load (a real defect: it starved a mind-map's diagram of its edit
  // affordances and read as "not found" everywhere this hook gates an
  // AccessGate). `authReady` alone settles true the moment Redux knows a
  // PERSISTED identity, which can be before the browser client's own local
  // session hydrates — so a signed-in caller also needs `accessToken` (set
  // once the client's own session is live) before firing. A confirmed
  // signed-out visitor has no `userId` to wait on, so their real anon/public
  // resolution is never blocked — only the signed-in race window is.
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const sessionSettled = authReady && (!userId || Boolean(accessToken));

  useEffect(() => {
    if (!resourceType || !resourceId || !sessionSettled) return;
    let active = true;
    getResourceAccess(resourceType, resourceId).then((result) => {
      if (!active) return;
      setAccess(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [resourceType, resourceId, sessionSettled]);

  const refresh = async () => {
    if (!resourceType || !resourceId) return;
    setAccess(await getResourceAccess(resourceType, resourceId));
  };

  return { ...access, loading, refresh };
}
