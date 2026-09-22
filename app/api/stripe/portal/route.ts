// app/api/stripe/portal/route.ts
//
// POST /api/stripe/portal — open the Stripe customer portal for the authed
// user. THIS is the one-click cancel path (TRUST mandate: no retention maze) —
// the portal is configured in the Stripe dashboard to allow immediate cancel.
//
// UNTESTED pending Stripe TEST keys.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  billingOwnerRef,
  ownerEq,
  readRequestOrganizationId,
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

    // REC-62: the Stripe customer belongs to the ORGANIZATION the person is acting
    // in. `billingOwnerRef` names whichever column is live and refuses rather than
    // substituting an organization once the move has landed.
    let owner;
    try {
      owner = await billingOwnerRef({
        userId: user.id,
        organizationId: readRequestOrganizationId(request),
      });
    } catch (err) {
      if (isBillingOrganizationRequiredError(err)) {
        return billingOrganizationRequiredResponse(supabase, err);
      }
      throw err;
    }

    const admin = createAdminClient();
    const { data } = await ownerEq(
      admin.schema("billing").from("customer").select("*"),
      owner,
    ).maybeSingle();
    const stripeCustomerId = asRowBag(data)?.["stripe_customer_id"];
    if (typeof stripeCustomerId !== "string" || !stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account for this organization" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${request.nextUrl.origin}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 },
    );
  }
}
