// lib/organizations/resolveActiveOrgContext.ts
//
// The ONE pure resolver for the user's organization context — personal org +
// the EXPLICIT active org — with no Redux dispatch and no side effects beyond
// priming the session-wide personal-org cache. It is the body that the
// `appContextPolicy` sync `remote.fetch` runs on cold-boot + stale-refresh, and
// that the back-compat `bootstrapActiveOrganization` thunk delegates to.
//
// Precedence for the active org — the platform's canonical order (ruling:
// common-docs/projects/no-db-assigned-org/PLAN.md row EX-T05; the same order
// Studio, the dashboard and the extension apply):
//   0. this browser's STORED SELECTION — the shared apex cookie
//      (`lib/organizations/activeOrgCookie.ts`), identity-keyed, written by
//      every Matrx surface on aimatrx.com — IF still a membership. This is how
//      a choice made in Workflow Studio is honoured here, and vice versa;
//   a. the user's DEFAULT org preference (durable, cross-device) — IF they are
//      still a member;
//   b. else their OWN PERSONAL org, IF it is one of their memberships. This
//      rung is what makes boot TOTAL (2026-09-12): before it existed, a person
//      with several memberships and no stated default ended boot with NO
//      selection at all, so every transport threw
//      "Select an organization before sending this request." while the header
//      cheerfully rendered the personal org. Choosing the personal workspace
//      HERE, explicitly, once, at bootstrap is a real choice the user can see
//      and change in the picker — it is emphatically NOT the forbidden thing,
//      which is a TRANSPORT quietly substituting the personal org per request
//      (`requireSelectedOrgId` still refuses, on purpose);
//   c. else, if they belong to exactly ONE org, that org (nothing to choose →
//      no nudge). Reachable when the personal-org RPC is unavailable;
//   d. else null ON PURPOSE — genuinely unresolved (no memberships at all).
//      The UI must then say so with a remedy and a picker
//      (`OrganizationRequiredNotice`), never leak a transport error string.
//
// The default org is the durable cross-DEVICE truth — read authoritatively
// from `users.user_preferences` so it never races the client preferences-sync
// hydration. The cookie is the cross-SURFACE truth for this browser.

import { getUserOrganizations } from "@/features/organizations/service";
import { isOwnPersonalOrg } from "@/features/organizations/types";
import {
  resolvePersonalOrgId,
  primePersonalOrgId,
} from "@/lib/organizations/personalOrg";
import { activeOrgCookie } from "@/lib/organizations/activeOrgCookie";
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

  // Fallback for the rare case where the RPC above failed. It may ONLY ever
  // resolve an org the user actually OWNS (`created_by`), which is exactly what
  // `iam.personal_org_id()` keys on — so the fallback can differ from the
  // server in availability, never in answer.
  //
  // The previous heuristic was `orgs.find(o => o.isPersonal) ?? orgs[0]`, and
  // both halves could hand back the WRONG org: `isPersonal` matches a
  // membership in someone ELSE's personal workspace, and `orgs[0]` is simply
  // whichever org sorted first. This value becomes `personal_organization_id`,
  // which `getActiveOrgId()` uses as the never-null org for WRITES — so a wrong
  // answer here silently files the user's rows into another person's org. A
  // membership in another account's personal org exists live today, so this was
  // reachable, not theoretical. Null (→ the loud nudge path) is the only
  // acceptable alternative to the right answer.
  const ownedPersonalOrg = orgs.find((o) =>
    isOwnPersonalOrg(o, userId),
  );
  const resolvedPersonalId = personalOrgId ?? ownedPersonalOrg?.id ?? null;
  primePersonalOrgId(resolvedPersonalId);

  // 0. This browser's stored selection (the shared apex cookie) — if still a
  //    member. A stale one is dropped so it cannot shadow the rungs below.
  const storedOrgId = activeOrgCookie.read(userId);
  if (storedOrgId) {
    const match = orgs.find((o) => o.id === storedOrgId);
    if (match) {
      return {
        organization_id: match.id,
        organization_name: match.name,
        personal_organization_id: resolvedPersonalId,
      };
    }
    activeOrgCookie.clear();
  }

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

  // b. THE USER'S OWN PERSONAL ORG — if it is one of their memberships.
  //    Boot must END with an explicit selection whenever the user belongs to
  //    anything at all; the personal workspace is the honest, user-visible
  //    default for "you never said". See the header note on rung b.
  if (resolvedPersonalId) {
    const personalMembership = orgs.find((o) => o.id === resolvedPersonalId);
    if (personalMembership) {
      return {
        organization_id: personalMembership.id,
        organization_name: personalMembership.name,
        personal_organization_id: resolvedPersonalId,
      };
    }
  }

  // c. Exactly one org → auto-select it (nothing to choose).
  if (orgs.length === 1) {
    return {
      organization_id: orgs[0].id,
      organization_name: orgs[0].name,
      personal_organization_id: resolvedPersonalId,
    };
  }

  // d. Genuinely unresolved: memberships exist but none of the rungs above
  //    could name one (no cookie, no default, personal org not a membership,
  //    and more than one org). The UI nudges; nothing is invented.
  return {
    organization_id: null,
    organization_name: null,
    personal_organization_id: resolvedPersonalId,
  };
}
