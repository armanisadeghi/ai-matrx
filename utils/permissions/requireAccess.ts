/**
 * requireAccess — the SERVER-side half of the P7 access gate.
 *
 * Server Components call this at the top of a gated route to resolve the current
 * user's access and (optionally) redirect when it's insufficient. This is what
 * makes the canonical view/edit route split (ROUTING.md §2) real: an
 * `[id]/edit` page requires `edit`; a view-only sharee is sent to the `[id]`
 * view route rather than shown an editor that silently fails its RLS writes.
 *
 *   // app/(core)/education/flashcards/[setId]/edit/page.tsx
 *   const { setId } = await params;
 *   await requireAccess("fc_set", setId, "edit", { redirectTo: `/education/flashcards/${setId}` });
 *
 * RLS is still the boundary; this is a UX redirect so sharees land on a page that
 * works. Uses the SSR Supabase client so it sees the caller's real session.
 */
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  getResourceAccess,
  accessSatisfies,
  type AccessLevel,
  type ResourceAccess,
} from "./access";

export interface RequireAccessOptions {
  /**
   * Where to send the caller when access is insufficient. If omitted,
   * `requireAccess` does NOT redirect — it just returns the resolved access so
   * the page can branch itself (e.g. render a read-only view + a "Make a copy"
   * offer inline instead of bouncing).
   */
  redirectTo?: string;
}

/**
 * Resolve the current caller's access to a resource on the server.
 * Never redirects — use it when you want to branch in the page yourself.
 */
export async function resolveAccess(
  resourceType: string,
  resourceId: string,
): Promise<ResourceAccess> {
  const supabase = await createClient();
  return getResourceAccess(resourceType, resourceId, supabase);
}

/**
 * Require at least `level` on a resource. Returns the resolved access when
 * satisfied. When not satisfied: redirects to `options.redirectTo` if given,
 * otherwise returns the (insufficient) access so the caller can branch.
 */
export async function requireAccess(
  resourceType: string,
  resourceId: string,
  level: AccessLevel,
  options: RequireAccessOptions = {},
): Promise<ResourceAccess> {
  const access = await resolveAccess(resourceType, resourceId);
  if (!accessSatisfies(access.level, level) && options.redirectTo) {
    redirect(options.redirectTo);
  }
  return access;
}
