/**
 * THE access predicate for CMS sites — org-scoped and shareable.
 *
 * Arman, 2026-08-15: "of course they should be ORG scoped and shareable."
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * The CMS lives in a SECOND Supabase project (`viyklljfdhtidwecakwx`) with its
 * own Auth domain and no `iam` schema, so it cannot run `iam.has_access` — the
 * platform's real resolver. The `/api/cms/*` routes have always been the
 * authorization boundary instead (they hold a service-role key that bypasses
 * RLS and enforce ownership in app code). Until now that boundary knew exactly
 * one rule: `owner_user_id = you`.
 *
 * That was the whole bug. MAIN `web.site` rows carry `settings.cms.site_id`
 * pointing into this project, and `resolveCmsLink` correctly refuses a pointer
 * the caller cannot read — so an org's marketing site named a CMS site no
 * teammate could open, and the CMS half of the growth loop silently stopped at
 * the page for them.
 *
 * ── THE RULE IS NOT INVENTED HERE ───────────────────────────────────────────
 *
 * It is a faithful twin of the org branch of MAIN's `iam.has_access_for_base`,
 * read out of the live function:
 *
 *     owner                                -> every level
 *     visibility >= internal + org ADMIN   -> every level
 *     visibility >= internal + org MEMBER  -> up to editor
 *     visibility  = public                 -> viewer
 *
 * "org admin" is `role in ('owner','admin')` and "org member" is any membership
 * row — matching `public.is_org_admin_for` and `iam.has_org_access_for` exactly.
 * `visibility` ordering is personal < internal < link < public, the sort order
 * of MAIN's `platform.visibility` enum.
 *
 * Editor — not admin — is what org membership confers, which is why `delete`
 * asks for `"admin"`: a teammate can build the site, and cannot destroy it.
 * That is the same asymmetry the share levels carry platform-wide.
 *
 * Membership itself is read through the canonical `mbr_for_user` RPC on the
 * MAIN project — the same RPC `features/organizations/service.ts` uses. No
 * second membership source is introduced, and nothing is cached across
 * requests: a revoked membership must stop working on the next call.
 *
 * The twin on the agent side is aidream `services/cms/access.py::can_access`.
 * Change one, change both.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  satisfiesPermissionLevel,
  type PermissionLevel,
} from "@/utils/permissions/types";

/** MAIN's canonical permission level. */
export type CmsAccessLevel = PermissionLevel;

/** Mirrors MAIN's `platform.visibility`, in ascending order. */
export const CMS_VISIBILITIES = [
  "personal",
  "internal",
  "link",
  "public",
] as const;
export type CmsVisibility = (typeof CMS_VISIBILITIES)[number];

export function isCmsVisibility(value: unknown): value is CmsVisibility {
  return (
    typeof value === "string" &&
    (CMS_VISIBILITIES as readonly string[]).includes(value)
  );
}

function visibilityRank(value: unknown): number {
  const index = CMS_VISIBILITIES.indexOf(value as CmsVisibility);
  // An unrecognized label is treated as the MOST restrictive, never the least:
  // an authorization check must fail closed on data it does not understand.
  return index === -1 ? 0 : index;
}

/** The governance columns every access decision reads. */
export interface CmsSiteAccessRow {
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: string | null;
}

/** The caller, resolved once per request. */
export interface CmsCaller {
  userId: string;
  /** Orgs where the caller is `owner`/`admin` — full rights on org-visible rows. */
  adminOrgIds: string[];
  /** Every org the caller belongs to — up to editor on org-visible rows. */
  memberOrgIds: string[];
}

/**
 * Resolve the caller's org memberships from the MAIN project.
 *
 * `mainSupabase` is the request's authenticated MAIN client — the RPC keys on
 * `auth.uid()` internally, so it can only ever return the caller's own rows.
 *
 * A membership read that FAILS yields empty lists, never a thrown request:
 * the caller still reaches everything they own, and simply cannot see org
 * sites. Degrading closed is correct; a 500 on the site list would be worse
 * and would hide the owner's own work too. The failure is logged loudly.
 */
export async function resolveCmsCaller(
  mainSupabase: SupabaseClient,
  userId: string,
): Promise<CmsCaller> {
  const { data, error } = await mainSupabase.rpc("mbr_for_user", {
    p_container_type: "organization",
  });

  if (error) {
    console.error(
      "[cms/access] membership read failed — falling back to owner-only access. " +
        "Org teammates will not see shared sites until this is fixed:",
      error.message,
    );
    return { userId, adminOrgIds: [], memberOrgIds: [] };
  }

  const rows = (data ?? []) as { container_id: string | null; role: string | null }[];
  const memberOrgIds: string[] = [];
  const adminOrgIds: string[] = [];
  for (const row of rows) {
    if (!row.container_id) continue;
    memberOrgIds.push(row.container_id);
    if (row.role === "owner" || row.role === "admin") {
      adminOrgIds.push(row.container_id);
    }
  }
  return { userId, adminOrgIds, memberOrgIds };
}

/**
 * THE predicate. True iff `caller` may `level` this site.
 *
 * Deliberately pure and synchronous so it is trivially testable and so no
 * callsite can accidentally skip the membership resolution above.
 */
export function canAccessCmsSite(
  caller: CmsCaller,
  site: CmsSiteAccessRow,
  level: CmsAccessLevel,
): boolean {
  if (!caller.userId) return false;

  // The owner always holds every level.
  if (site.owner_user_id && site.owner_user_id === caller.userId) return true;

  const rank = visibilityRank(site.visibility);

  // `public` is readable by anyone signed in (viewer only).
  if (
    site.visibility === "public" &&
    !satisfiesPermissionLevel(level, "editor")
  ) {
    return true;
  }

  // Everything below needs an org AND at least `internal` visibility. A
  // `personal` site is the individual's own, no matter which org it sits in.
  if (!site.organization_id) return false;
  if (rank < visibilityRank("internal")) return false;

  if (caller.adminOrgIds.includes(site.organization_id)) return true;
  if (
    !satisfiesPermissionLevel(level, "admin") &&
    caller.memberOrgIds.includes(site.organization_id)
  ) {
    return true;
  }

  return false;
}

/**
 * The PostgREST `.or(...)` filter for "sites this caller can open" — the query
 * form of `canAccessCmsSite(caller, site, "viewer")`, minus the `public` lane.
 *
 * Public-but-not-mine sites are deliberately NOT listed: THE VIEW LAW says a
 * list declares its own scope, and flooding a person's site list with every
 * public site in the platform is the failure that law exists to prevent. They
 * remain reachable by id through `get`, which uses the full predicate.
 *
 * Returns `null` when the caller belongs to no org — the caller should then
 * filter on `owner_user_id` alone, because an empty `in.()` is a PostgREST
 * syntax error, not an empty set.
 */
export function cmsVisibleSitesFilter(caller: CmsCaller): string | null {
  if (caller.memberOrgIds.length === 0) return null;
  const orgList = caller.memberOrgIds.join(",");
  return (
    `owner_user_id.eq.${caller.userId},` +
    `and(organization_id.in.(${orgList}),visibility.in.(internal,link,public))`
  );
}

/**
 * How the caller reaches a site — for the UI, so a teammate's site is never
 * silently indistinguishable from their own.
 */
export function cmsAccessSource(
  caller: CmsCaller,
  site: CmsSiteAccessRow,
): "owner" | "organization" | "public" | "none" {
  if (site.owner_user_id && site.owner_user_id === caller.userId) return "owner";
  if (
    site.organization_id &&
    visibilityRank(site.visibility) >= visibilityRank("internal") &&
    caller.memberOrgIds.includes(site.organization_id)
  ) {
    return "organization";
  }
  if (site.visibility === "public") return "public";
  return "none";
}
