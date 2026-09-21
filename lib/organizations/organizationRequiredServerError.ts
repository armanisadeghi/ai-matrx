// lib/organizations/organizationRequiredServerError.ts
//
// THE SERVER'S ANSWER TO "THIS REQUEST NEEDS AN ORGANIZATION AND NAMES NONE".
//
// Ruling (Arman, 2026-09-19): a "default organization" is at most a per-client
// DISPLAY preference. Nothing but the org picker and pure UI display may read
// it. No data read, no write, no API route, no server action, no transport and
// no boot ladder may PICK an organization for the user — not from a cookie,
// not from a saved preference, not from their personal workspace. A request
// that needs an organization and has none is HELD: the person is shown their
// memberships, SETS one, and the request proceeds normally.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// Until 2026-09-19 the route handlers under `app/api/**` that needed an
// organization called `ensureOrgIdServer(client, undefined)`, which ended in
// the `current_personal_org_id()` RPC — the server substituting the person's
// personal workspace for a choice nobody made. That is the exact shape the
// ruling forbids, on the one side of the wire the client cannot see.
//
// THE ENVELOPE IS BYTE-FOR-BYTE AIDREAM'S (2026-09-19 unification).
// -------------------------------------------------------------------------
// Until this unification the Next side answered a DIFFERENT shape — a
// top-level `memberships` field — while aidream's `organization_hold_detail`
// (canonical builder: `matrx_connect/org_hold.py`, re-exported by
// `aidream/services/organizations/org_hold.py`) nests the caller's choices
// under `details.organizations`. Two shapes meant `isOrganizationRequiredError`
// had to know which server it was reading, and a client-side helper written
// against one silently mis-parsed the other. There is now ONE shape, emitted
// here field-for-field against that Python builder's own output:
//
//   {
//     error: "organization_required",
//     code: "organization_required",
//     message: "<developer/agent-facing sentence>",
//     user_message: "<plain English for the person>",
//     details: {
//       hold: "organization_required",
//       can_choose: true,
//       set_on: "request" | "mcp_connection" | "coding_session",
//       remedy: "<plain English: exactly what to do>",
//       organizations: [{ id, name, abbreviation }] | null,
//       memberships_url: "/auth/organizations",
//     },
//   }
//
// `set_on` is always `"request"` here — a Next route handler refuses the same
// way `matrx-connect`'s auth boundary does for an ordinary HTTP request; the
// other two values (`mcp_connection`, `coding_session`) belong to surfaces
// this repo does not have. `memberships_url` is aidream's own literal
// (`/auth/organizations`, reachable on the Python server) rather than an
// invented Next path, because the value is informational parity with the
// canonical envelope, not a route this repo serves.
//
// Status is 400, the same status and the same `code` aidream answers with.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

/** One organization the caller may choose, as the refusal carries it. */
export interface OrganizationMembershipSummary {
  id: string;
  name: string;
  abbreviation?: string;
}

export const ORGANIZATION_REQUIRED_CODE = "organization_required" as const;

/** aidream's `matrx_connect.org_hold.MEMBERSHIPS_URL` — the ONE reachable
 * endpoint for the caller's own membership list (on aidream's server). Kept
 * as the literal aidream itself emits so the envelope is identical on both
 * servers, not a Next-side invention. */
export const MEMBERSHIPS_URL = "/auth/organizations" as const;

/** aidream's `HoldSurface` (`matrx_connect/org_hold.py`) — only `"request"`
 * applies to a Next API route; the other two values name an MCP connection
 * or a coding session, neither of which this repo answers on. */
export type OrganizationHoldSetOn =
  | "request"
  | "mcp_connection"
  | "coding_session";

/**
 * The refusal, as a throwable. Route handlers let it reach their catch and
 * answer with `organizationRequiredResponse(error)`; nothing recovers from it
 * by choosing an organization, because choosing is the person's act.
 */
export class OrganizationRequiredServerError extends Error {
  override name = "OrganizationRequiredServerError" as const;
  readonly code = ORGANIZATION_REQUIRED_CODE;
  /**
   * `null` only when the list could not be read on this path (mirrors
   * aidream's own `organizations` field) — the honest "we could not ask"
   * distinct from "you belong to nothing" (`[]`).
   */
  readonly memberships: OrganizationMembershipSummary[] | null;

  constructor(
    message: string,
    memberships: OrganizationMembershipSummary[] | null = null,
  ) {
    super(message);
    this.memberships = memberships;
  }
}

export function isOrganizationRequiredServerError(
  error: unknown,
): error is OrganizationRequiredServerError {
  return (
    error instanceof OrganizationRequiredServerError ||
    (error instanceof Error && error.name === "OrganizationRequiredServerError")
  );
}

/**
 * The caller's own MEMBERSHIPS — the organizations this person actually
 * belongs to, and the only ones a refusal may offer them.
 *
 * 🚨 THIS READS `iam.memberships`, NOT `iam.organizations` (corrected
 * 2026-09-19, in review). It used to select every row of `iam.organizations`
 * that RLS would return and call the result "memberships". Those are not the
 * same set, and the live `org_select_policy` is why:
 *
 *   is_platform_admin() OR created_by = auth.uid() OR id IN (iam.my_orgs())
 *
 * So the old read answered with (a) EVERY organization on the platform for any
 * platform admin, and (b) organizations the person merely CREATED and has
 * since left. Measured live on 2026-09-19 for the testing identity
 * `admin@admin.com`: 501 organizations returned, against 27 genuine active
 * memberships. A refusal that hands a person 501 tenants to file their write
 * into is the substitution wearing a picker — the whole point of the envelope
 * is that the choice is bounded by what they actually belong to. It also put
 * 501 other organizations' names into an error body, which is nobody's
 * business but theirs.
 *
 * The membership row is the fact (the same source
 * `iam.provision_signup_organization` and the picker treat as authoritative):
 * container_type 'organization', status 'active', not soft-deleted.
 *
 * Returns `null` (not `[]`) on any failure — no user, a read error, an
 * unexpected throw — so a client can tell "you belong to nothing" (`[]`) from
 * "we could not ask" (`null`), exactly as aidream's own `membership_choices`
 * does. The refusal is still the honest answer either way; the client falls
 * back to the picker's own list.
 */
export async function readCallerMemberships(
  client: SupabaseClient,
): Promise<OrganizationMembershipSummary[] | null> {
  try {
    const { data: auth } = await getClaimsUser(client);
    const userId = auth?.user?.id;
    if (!userId) return null;
    const { data, error } = await client
      .schema("iam")
      .from("memberships")
      .select("organization_id, organizations:organization_id(id,name,abbreviation)")
      .eq("user_id", userId)
      .eq("container_type", "organization")
      .eq("status", "active")
      .is("deleted_at", null);
    if (error || !data) return null;
    const rows = data as unknown as {
      organization_id: string;
      organizations: {
        id: string;
        name: string | null;
        abbreviation: string | null;
      } | null;
    }[];
    return rows
      .map((row) => ({
        id: row.organizations?.id ?? row.organization_id,
        name: row.organizations?.name ?? "Untitled organization",
        ...(row.organizations?.abbreviation
          ? { abbreviation: row.organizations.abbreviation }
          : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

/**
 * Refuse, with the choices attached. Call it where a handler used to
 * substitute: read the memberships, throw, answer with the envelope.
 */
export async function organizationRequired(
  client: SupabaseClient,
  message: string,
): Promise<never> {
  throw new OrganizationRequiredServerError(
    message,
    await readCallerMemberships(client),
  );
}

/** aidream's `matrx_connect.org_hold.organization_hold_detail`'s `details`,
 * emitted here field-for-field (see the module header). */
export interface OrganizationHoldDetails {
  hold: typeof ORGANIZATION_REQUIRED_CODE;
  can_choose: true;
  set_on: OrganizationHoldSetOn;
  remedy: string;
  organizations: OrganizationMembershipSummary[] | null;
  memberships_url: string;
}

export interface OrganizationRequiredEnvelope {
  error: typeof ORGANIZATION_REQUIRED_CODE;
  code: typeof ORGANIZATION_REQUIRED_CODE;
  message: string;
  user_message: string;
  details: OrganizationHoldDetails;
}

/**
 * The wire body — aidream's `organization_hold_detail` output, field for
 * field (source of truth: `aidream/services/organizations/org_hold.py`, which
 * re-exports the pure builder in `packages/matrx-connect/matrx_connect/org_hold.py`).
 * A Next route handler is always a `"request"`-surface refusal, the same as
 * `matrx-connect`'s own HTTP door.
 */
export function organizationRequiredEnvelope(
  error: OrganizationRequiredServerError,
): OrganizationRequiredEnvelope {
  return {
    error: ORGANIZATION_REQUIRED_CODE,
    code: ORGANIZATION_REQUIRED_CODE,
    message: error.message,
    user_message:
      "Choose the organization you're working in, then try again.",
    details: {
      hold: ORGANIZATION_REQUIRED_CODE,
      can_choose: true,
      set_on: "request",
      remedy:
        "Choose the organization you're working in and send it with the " +
        "request (the X-Organization-Id header), then try again.",
      organizations: error.memberships,
      memberships_url: MEMBERSHIPS_URL,
    },
  };
}
