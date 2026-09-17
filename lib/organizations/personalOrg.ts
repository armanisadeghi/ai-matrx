// lib/organizations/personalOrg.ts
//
// The ONE canonical way to resolve the signed-in user's PERSONAL organization
// id on the client — the identity of the person's OWN workspace.
//
// 🚨 IT IS NOT A FALLBACK. Until 2026-09-17 this module also owned "the
// never-null fallback for org-scoped writes": `ensureOrgId` ended in the
// personal-org RPC whenever Redux held no selection, so a write the person
// made with nothing selected was filed in their personal workspace silently.
// That is exactly what the law forbids — the organization is READ below the
// boundary, never invented, defaulted or substituted
// (common-docs/policies/context-is-carried-never-rebuilt.md). Boot has been
// TOTAL since 2026-09-12 (`resolveActiveOrgContext` rung b explicitly SELECTS
// the user's own personal workspace when nothing else applies), so a missing
// selection now means genuinely unresolved, and `ensureOrgId` REFUSES.
//
// What remains here answers one question only: "which organization is this
// user's own workspace?" — the bootstrap resolver asks it, and so may a
// surface that deliberately, by name, files something personal (a creator's
// payout account, a person's cross-organization notification default).
//
// Backed by the `current_personal_org_id()` RPC (SECURITY DEFINER, no args —
// resolves `auth.uid()` server-side). Every user's personal org is
// auto-provisioned at signup and its id never changes, so this is fetched at
// most ONCE per session and memoized at module scope.
//
// Priming: the active-org bootstrap (`lib/redux/thunks/activeOrgBootstrap.ts`)
// calls the RPC at session start and primes this cache, so callsites that read
// it afterward make zero extra network calls.
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
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
// The ONE error type for "no organization is selected" — the same class the
// transport kernel and `requireSelectedOrgId` throw, so every surface's
// existing recogniser (`isOrganizationRequiredError`) already handles it.
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
// Cycle-free leaf (same constraint as activeOrg.ts) — never `@/lib/redux/store`.
import { getStoreSingleton } from "@/lib/redux/store-singleton";

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
 * Resolve the organization an org-scoped write acts in. Resolution order:
 *   1. the explicitly-passed `orgId` (a callsite that already knows the
 *      organization — a durable record's own org, for instance);
 *   2. the organization the user SELECTED (`getActiveOrgId`, i.e. Redux
 *      `appContext.organization_id`), after joining the store's bootstrap
 *      hydration so a write racing boot is not mistaken for a missing one;
 *   3. otherwise THROW. There is no third rung: a personal-organization
 *      backstop files the person's work in a workspace they never chose, and
 *      does it silently. Boot explicitly SELECTS the personal workspace when
 *      nothing else applies, so if we get here nothing is selected at all.
 *
 * The throw is the same `OrganizationContextError` every transport raises, so
 * a surface that already renders `OrganizationRequiredNotice` on
 * `isOrganizationRequiredError` shows the picker and the remedy rather than a
 * raw string.
 *
 * Law: common-docs/policies/context-is-carried-never-rebuilt.md.
 */
export async function ensureOrgId(
  orgId: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  let activeOrgId = getActiveOrgId();
  if (activeOrgId) return activeOrgId;

  // Descendant passive effects can write in the same commit that starts
  // SyncBootstrap. Join its store-owned warm-cache hydration before treating
  // missing organization context as missing.
  const store = getStoreSingleton() as
    | (ReturnType<typeof getStoreSingleton> & {
        _sync?: { boot: () => Promise<void> };
      })
    | null;
  await store?._sync?.boot();
  activeOrgId = getActiveOrgId();
  if (activeOrgId) return activeOrgId;

  throw new OrganizationContextError(
    "organization_context_required",
    "Select an organization before sending this request.",
  );
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

/**
 * Resolve an org id for an org-scoped write made on behalf of an ARBITRARY user
 * (not the calling session) — the case for admin/secret-key clients that have no
 * `auth.uid()` of their own (e.g. SMS send/receive, Twilio webhooks). Returns
 * the given org id when set; otherwise the named user's personal org via the
 * `ensure_personal_organization(p_user_id)` RPC; otherwise — when there is no
 * user at all (unassigned phone number, unrouted inbound SMS) — the global
 * system org. Mirrors `lib/scheduler-client/claim.ts`, which resolves the org
 * for an arbitrary task owner the same way.
 */
export async function resolveOrgIdForUserServer(
  client: SupabaseClient,
  userId: string | null | undefined,
  orgId?: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  if (userId) {
    const { data, error } = await client.rpc("ensure_personal_organization", {
      p_user_id: userId,
    });
    if (error || !data) {
      throw (
        error ??
        new Error(
          `ensure_personal_organization() returned no personal organization for user ${userId}`,
        )
      );
    }
    return data as string;
  }
  return resolveSystemOrgId(client);
}
