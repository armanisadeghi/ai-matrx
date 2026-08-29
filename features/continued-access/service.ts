// features/continued-access/service.ts
//
// The departed-member portal's ONE read (platform primitive `continued-access`).
//
// 🚨 THE DOOR IS `continued_access_portal`, AND ITS ONLY ARGUMENT IS `p_organization_id`.
// Verified against `pg_proc`:
//   continued_access_portal(p_organization_id uuid DEFAULT NULL) RETURNS jsonb
// It takes NO user id, deliberately: it answers for `auth.uid()` and nobody else, so there is
// no argument through which one person could be pointed at another person's portal.
//
// 🚨 IT RETURNS THE ENABLED FEATURES, NOT A BOOLEAN. The organization chooses which aspects of
// the portal it offers (Arman, 2026-08-29: "they can choose which aspects of it they opt in
// for"), and `features` is that choice, resolved through the knob ladder. The surface renders
// exactly this array — which is why adding the next aspect is one knob and one lookup entry,
// and why a feature this array does not name must render NOTHING at all.

"use client";

import { supabase } from "@/utils/supabase/client";

/** One organization the caller has departed from. */
export type ContinuedAccessOrganization = {
  organization_id: string;
  organization_name: string;
  departed_at: string;
  /**
   * Why the portal is, or is not, answering — each value is a different sentence the product
   * owes the person, never a blank page:
   *   `departed`        the portal is live for them here
   *   `portal_off`      this organization does not offer a portal to people who have left
   *   `access_expired`  the window the organization set has closed
   *   `access_revoked`  the organization withdrew access deliberately
   */
  state: "departed" | "portal_off" | "access_expired" | "access_revoked";
  /** null = access does not expire (the organization chose to keep it on indefinitely). */
  access_cutoff_at: string | null;
  /** The aspects this organization has switched ON. Empty unless `state === "departed"`. */
  features: string[];
};

export type ContinuedAccessPortalResult =
  | { ok: true; organizations: ContinuedAccessOrganization[] }
  | { ok: false; reason: "no_authenticated_caller" | "unreachable"; message: string };

/**
 * What the signed-in caller may see in the departed-member portal.
 *
 * 🚨 THE TRANSPORT NEVER THROWS, IT RETURNS — the same law the HR service learned the hard way
 * (`features/hr/service.ts`): `supabase.rpc` REJECTS on a network failure, and a rejection that
 * escapes leaves the page on a spinner forever with nothing rendered to the person. Every
 * failure on this path is data.
 */
export async function fetchContinuedAccessPortal(
  organizationId?: string,
): Promise<ContinuedAccessPortalResult> {
  let data: unknown = null;
  let error: { message?: string } | null = null;
  try {
    ({ data, error } = (await supabase.rpc("continued_access_portal" as never, {
      p_organization_id: organizationId ?? null,
    } as never)) as { data: unknown; error: { message?: string } | null });
  } catch (thrown) {
    return {
      ok: false,
      reason: "unreachable",
      message:
        thrown instanceof Error
          ? "Your portal did not reach the server. Check your connection and try again."
          : "Your portal did not reach the server. Check your connection and try again.",
    };
  }

  if (error) {
    return {
      ok: false,
      reason: "unreachable",
      message: "Your portal could not be loaded just now. Try again in a moment.",
    };
  }

  const body = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    organizations?: ContinuedAccessOrganization[];
  };

  if (body.ok !== true) {
    // The only refusal this door issues is "nobody is signed in".
    return {
      ok: false,
      reason: "no_authenticated_caller",
      message: "Sign in to open your portal.",
    };
  }

  return { ok: true, organizations: body.organizations ?? [] };
}
