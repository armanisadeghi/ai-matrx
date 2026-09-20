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
// THE ENVELOPE. The shape matches what the Python server's
// `organization_for_request` (aidream/services/organizations/request_scope.py)
// emits, field for field — `error`, `code`, `message`, `user_message` — so one
// client recogniser handles a refusal from either server. This adds the one
// field the ruling requires and aidream does not yet carry: `memberships`,
// the caller's OWN organizations, so the client can render the picker from the
// refusal itself instead of making a second round trip to find out what the
// person may choose.
//
// Status is 400, the same status and the same `code` aidream answers with.

import type { SupabaseClient } from "@supabase/supabase-js";

/** One organization the caller may choose, as the refusal carries it. */
export interface OrganizationMembershipSummary {
  id: string;
  name: string;
}

export const ORGANIZATION_REQUIRED_CODE = "organization_required" as const;

/**
 * The refusal, as a throwable. Route handlers let it reach their catch and
 * answer with `organizationRequiredResponse(error)`; nothing recovers from it
 * by choosing an organization, because choosing is the person's act.
 */
export class OrganizationRequiredServerError extends Error {
  override name = "OrganizationRequiredServerError" as const;
  readonly code = ORGANIZATION_REQUIRED_CODE;
  readonly memberships: OrganizationMembershipSummary[];

  constructor(message: string, memberships: OrganizationMembershipSummary[] = []) {
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
 * Returns an empty list on any failure: the refusal is still the honest
 * answer, it simply cannot offer the choices inline, and the client falls back
 * to the picker's own list.
 */
export async function readCallerMemberships(
  client: SupabaseClient,
): Promise<OrganizationMembershipSummary[]> {
  try {
    const { data: auth } = await client.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return [];
    const { data, error } = await client
      .schema("iam")
      .from("memberships")
      .select("organization_id, organizations:organization_id(id,name)")
      .eq("user_id", userId)
      .eq("container_type", "organization")
      .eq("status", "active")
      .is("deleted_at", null);
    if (error || !data) return [];
    const rows = data as unknown as {
      organization_id: string;
      organizations: { id: string; name: string | null } | null;
    }[];
    return rows
      .map((row) => ({
        id: row.organizations?.id ?? row.organization_id,
        name: row.organizations?.name ?? "Untitled organization",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
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

export interface OrganizationRequiredEnvelope {
  error: typeof ORGANIZATION_REQUIRED_CODE;
  code: typeof ORGANIZATION_REQUIRED_CODE;
  message: string;
  user_message: string;
  memberships: OrganizationMembershipSummary[];
}

/** The wire body, matching aidream's `organization_for_request` field names. */
export function organizationRequiredEnvelope(
  error: OrganizationRequiredServerError,
): OrganizationRequiredEnvelope {
  return {
    error: ORGANIZATION_REQUIRED_CODE,
    code: ORGANIZATION_REQUIRED_CODE,
    message: error.message,
    user_message:
      "Choose the organization you're working in, then try again.",
    memberships: error.memberships,
  };
}
