// lib/organizations/resolveActiveOrgContext.ts
//
// The ONE pure resolver for the user's organization context — personal org +
// the EXPLICIT active org — with no Redux dispatch and no side effects beyond
// priming the session-wide personal-org cache. It is the body that the
// `appContextPolicy` sync `remote.fetch` runs on cold-boot + stale-refresh, and
// that the back-compat `bootstrapActiveOrganization` thunk delegates to.
//
// Precedence for the active org (unchanged from the old island bootstrap):
//   a. the user's DEFAULT org preference (durable, cross-device) — IF they are
//      still a member;
//   b. else, if they belong to exactly ONE org, that org (nothing to choose →
//      no nudge);
//   c. else null ON PURPOSE — the signal the UI uses to nudge the user to pick
//      one. The personal org still rides along on writes via
//      selectEffectiveOrganizationId / getActiveOrgId.
//
// The default org is the single durable "which org am I in" source of truth —
// read authoritatively from `users.user_preferences` so it never races the
// client preferences-sync hydration. Cross-session restore = set your default.

import { getUserOrganizations } from "@/features/organizations/service";
import {
  resolvePersonalOrgId,
  primePersonalOrgId,
} from "@/lib/organizations/personalOrg";
import { supabase } from "@/utils/supabase/client";

/** The org subset of appContext this resolver produces. */
export interface ResolvedOrgContext {
  organization_id: string | null;
  organization_name: string | null;
  personal_organization_id: string | null;
}

/**
 * Read the user's default-org preference straight from `user_preferences`.
 * Authoritative + race-free. Never throws — null on any failure (→ nudge path).
 */
async function readDefaultOrgIdFromDb(
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .schema("users")
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const prefs = data.preferences as {
      organization?: { defaultOrganizationId?: string | null };
    } | null;
    return prefs?.organization?.defaultOrganizationId ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the user's org context (personal + active). Pure read — never
 * dispatches. Primes the personal-org session cache as a side benefit so
 * downstream `ensureOrgId(undefined)` callsites resolve with zero round-trips.
 * Returns null only when the user has no orgs at all AND no personal org.
 */
export async function resolveActiveOrgContext(
  userId: string,
): Promise<ResolvedOrgContext | null> {
  // Authoritative personal org id (auto-provisioned at signup). Falls back to
  // the org-list heuristic only if the RPC is unavailable.
  let personalOrgId: string | null = null;
  try {
    personalOrgId = await resolvePersonalOrgId();
  } catch (e) {
    console.warn(
      "[resolveActiveOrgContext] current_personal_org_id() failed; falling back to org-list heuristic",
      e,
    );
  }

  const orgs = await getUserOrganizations();

  // No memberships at all — still surface the personal org if we have one.
  if (!orgs || orgs.length === 0) {
    if (!personalOrgId) return null;
    primePersonalOrgId(personalOrgId);
    return {
      organization_id: null,
      organization_name: null,
      personal_organization_id: personalOrgId,
    };
  }

  const resolvedPersonalId =
    personalOrgId ?? (orgs.find((o) => o.isPersonal) ?? orgs[0])?.id ?? null;
  primePersonalOrgId(resolvedPersonalId);

  // a. Default org preference (durable, cross-device) — if still a member.
  const preferredOrgId = await readDefaultOrgIdFromDb(userId);
  if (preferredOrgId) {
    const match = orgs.find((o) => o.id === preferredOrgId);
    if (match) {
      return {
        organization_id: match.id,
        organization_name: match.name,
        personal_organization_id: resolvedPersonalId,
      };
    }
  }

  // b. Exactly one org → auto-select it (nothing to choose).
  if (orgs.length === 1) {
    return {
      organization_id: orgs[0].id,
      organization_name: orgs[0].name,
      personal_organization_id: resolvedPersonalId,
    };
  }

  // c. Multiple orgs, no valid default → null active (nudge). Personal rides on.
  return {
    organization_id: null,
    organization_name: null,
    personal_organization_id: resolvedPersonalId,
  };
}
