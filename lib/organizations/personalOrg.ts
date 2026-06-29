// lib/organizations/personalOrg.ts
//
// The ONE canonical way to resolve the signed-in user's PERSONAL organization
// id on the client — the never-null fallback for org-scoped writes.
//
// Backed by the `current_personal_org_id()` RPC (SECURITY DEFINER, no args —
// resolves `auth.uid()` server-side). Every user's personal org is
// auto-provisioned at signup and its id never changes, so this is fetched at
// most ONCE per session and memoized at module scope. Do NOT call the RPC per
// row / per insert — read `ensureOrgId()` instead; it hits the warm cache.
//
// Priming: the active-org bootstrap (`lib/redux/thunks/activeOrgBootstrap.ts`)
// calls the RPC at session start and primes this cache, so service callsites
// that read it afterward make zero extra network calls.
//
// Lifetime: the cache is module-scoped, so it lives for the tab's page
// lifetime. Sign-out does a full `window.location.href` navigation (see
// SignOutMenuItem), which tears down all JS state — so the cache is
// automatically dropped between users. `clearPersonalOrgIdCache()` exists for
// tests and any future in-place auth swap.
//
// This SUPERSEDES the scattered per-callsite `ensure_personal_organization`
// resolvers. The one exception that must NOT use this primitive is
// `lib/scheduler-client/claim.ts`, which resolves the org for an ARBITRARY task
// owner (not `auth.uid()`) and so still needs the parameterized RPC.

import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedId: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * Seed the cache with a known personal org id (e.g. from the active-org
 * bootstrap, which already fetched it). No-op for a null/empty id.
 */
export function primePersonalOrgId(id: string | null | undefined): void {
  if (id) cachedId = id;
}

/** Synchronous peek at the cached personal org id, or null if not yet loaded. */
export function peekPersonalOrgId(): string | null {
  return cachedId;
}

/** Drop the cached personal org id. For tests / in-place auth swaps only. */
export function clearPersonalOrgIdCache(): void {
  cachedId = null;
  inflight = null;
}

/**
 * The signed-in user's personal organization id. Cached for the session;
 * makes at most one `current_personal_org_id()` RPC call. Throws loudly if the
 * user has no personal org (should be impossible — auto-provisioned at signup —
 * so it surfaces a real defect rather than letting a null org slip into a write).
 */
export async function resolvePersonalOrgId(): Promise<string> {
  if (cachedId) return cachedId;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase.rpc("current_personal_org_id");
    if (error || !data) {
      throw (
        error ??
        new Error(
          "current_personal_org_id() returned no personal organization for the signed-in user",
        )
      );
    }
    cachedId = data as string;
    return cachedId;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Resolve an org id for an org-scoped write: returns the given id when set,
 * otherwise the cached personal org. Use this everywhere instead of writing a
 * null `organization_id` — "never insert an org-scoped row with a null org."
 */
export async function ensureOrgId(
  orgId: string | null | undefined,
): Promise<string> {
  return orgId ? orgId : resolvePersonalOrgId();
}

/**
 * Server-side personal-org resolver for the session bound to the GIVEN SSR
 * client. Use in route handlers / Server Actions, where the module-scoped
 * browser cache above MUST NOT be used — server module scope is shared across
 * requests and users, so caching `auth.uid()`'s personal org would leak it to
 * the next request. Resolves per call via `current_personal_org_id()` (no
 * cache). Returns the given id when set, otherwise resolves the session's org.
 */
export async function ensureOrgIdServer(
  client: SupabaseClient,
  orgId: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  const { data, error } = await client.rpc("current_personal_org_id");
  if (error || !data) {
    throw (
      error ??
      new Error(
        "current_personal_org_id() returned no personal organization for the session",
      )
    );
  }
  return data as string;
}
