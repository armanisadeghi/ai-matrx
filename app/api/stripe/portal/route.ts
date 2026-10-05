// app/api/stripe/portal/route.ts
//
// POST /api/stripe/portal — open the Stripe customer portal for the authed
// user. THIS is the one-click cancel path (TRUST mandate: no retention maze) —
// cancellation stops renewal while retaining the paid period.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { isStripeConfigured, requiredStripeMode } from "@/lib/stripe/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { openSubscriptionPortal } from "@/features/entitlements/stripe/portal";
import { requestOrigin } from "@/utils/auth/request-origin";
import {
  billingOwnerRef,
  ownerEq,
  readRequestOrganizationState,
  isBillingOrganizationContextUnavailableError,
  asRowBag,
} from "@/features/entitlements/stripe/billingOwner";
import {
  billingOrganizationRequiredResponse,
  isBillingOrganizationRequiredError,
} from "@/features/entitlements/stripe/billingOwnerRoute";

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured yet." },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const admin = createAdminClient();
    const origin = requestOrigin(request.headers) ?? request.nextUrl.origin;
    const livemode = requiredStripeMode() === "live";
    const { data: personal, error: personalError } = await admin
      .schema("billing")
      .from("customer")
      .select("stripe_customer_id")
      .eq("beneficiary_user_id", user.id)
      .eq("livemode", livemode)
      .maybeSingle();
    if (personalError) throw personalError;
    const body: unknown = await request.json().catch(() => null);
    const organizationPortal =
      body &&
      typeof body === "object" &&
      "scope" in body &&
      body.scope === "organization";
    if (personal && !organizationPortal) {
      const session = await openSubscriptionPortal(
        personal.stripe_customer_id,
        true,
        `${origin}/pricing`,
      );
      return NextResponse.json({ url: session.url });
    }
    if (!organizationPortal) {
      return NextResponse.json(
        { error: "No personal billing account" },
        { status: 404 },
      );
    }

    // REC-62: the Stripe customer belongs to the ORGANIZATION the person is acting
    // in. `billingOwnerRef` names whichever column is live and refuses rather than
    // substituting an organization once the move has landed.
    let owner;
    try {
      owner = await billingOwnerRef({
        userId: user.id,
        // The STATE, not a nullable id: "the request named none" and "we could not
        // read what the request says" are different answers and get different
        // replies (features/entitlements/stripe/billingOwner.ts).
        organization: readRequestOrganizationState(request),
      });
    } catch (err) {
      if (isBillingOrganizationRequiredError(err)) {
        return billingOrganizationRequiredResponse(supabase, err);
      }
      if (isBillingOrganizationContextUnavailableError(err)) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }

    const { data: membership, error: membershipError } = await supabase
      .schema("iam")
      .from("organization_member")
      .select("user_id,role")
      .eq("organization_id", owner.value)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role ?? ""))
      return NextResponse.json(
        {
          error: "An organization owner or admin must manage its subscription.",
        },
        { status: 403 },
      );
    const { data, error } = await ownerEq(
      admin.schema("billing").from("customer").select("*"),
      owner,
    )
      .eq("livemode", livemode)
      .is("beneficiary_user_id", null)
      .maybeSingle();
    if (error) throw error;
    const stripeCustomerId = asRowBag(data)?.["stripe_customer_id"];
    if (typeof stripeCustomerId !== "string" || !stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account for this organization" },
        { status: 404 },
      );
    }

    const session = await openSubscriptionPortal(
      stripeCustomerId,
      false,
      `${origin}/pricing`,
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 },
    );
  }
}
