// features/entitlements/stripe/billingOwnerRoute.ts
//
// The HTTP half of the billing owner seam — kept apart from `billingOwner.ts` for
// the same mechanical reason `lib/organizations/organizationRequiredResponse.ts` is
// kept apart from its own leaf: `next/server` must never be dragged into a browser
// bundle, and `billingOwner.ts` is the module the write paths import.
//
// WHAT IT IS FOR. Once REC-62 lands, a Stripe write needs the organization the
// person is acting in and NOTHING picks one for them. A route that cannot see the
// `X-Organization-Id` header must therefore answer the way every other
// organization-scoped route in this app already answers: the standard
// `organization_required` envelope, with the caller's own memberships attached, so
// the client opens its picker, the person chooses, and the original action
// continues. A bespoke 400 with a bespoke sentence would be a second refusal
// vocabulary the picker cannot recognise.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OrganizationRequiredServerError,
  organizationRequiredResponse,
  readCallerMemberships,
} from "@/lib/organizations/organizationRequiredResponse";
import { BillingOrganizationRequiredError } from "./billingOwner";

export { BillingOrganizationRequiredError, isBillingOrganizationRequiredError } from "./billingOwner";

/**
 * The refusal, as the envelope the organization picker already understands.
 * `client` is the caller's own (RLS) client, so the memberships listed are theirs.
 */
export async function billingOrganizationRequiredResponse(
  client: SupabaseClient,
  error: BillingOrganizationRequiredError,
): Promise<NextResponse> {
  return organizationRequiredResponse(
    new OrganizationRequiredServerError(
      error.message,
      await readCallerMemberships(client),
    ),
  );
}
