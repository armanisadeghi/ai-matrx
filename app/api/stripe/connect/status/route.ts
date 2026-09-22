// app/api/stripe/connect/status/route.ts
//
// GET /api/stripe/connect/status — the authed creator's live Connect status. When
// a connected account exists, this retrieves it from Stripe and refreshes the local
// mirror (so the dashboard reflects onboarding progress the instant the creator
// returns, without waiting on the account.updated webhook).
//
// It also returns Stripe's REQUIREMENT lists (`currently_due`, `past_due`,
// `pending_verification`, `disabled_reason`), which the mirror row does not and
// cannot hold — they change with no webhook of their own. They are what lets the
// payouts checklist name the one document Stripe is waiting for instead of
// saying "payouts are off" and leaving the creator to guess.
//
// `requirements: null` means WE COULD NOT ASK STRIPE. It is not "nothing is
// due" — the checklist renders it as its neutral unknown, never as a pass.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import {
  getConnectAccount,
  refreshConnectAccount,
} from "@/features/entitlements/stripe/connect";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  billingOwnerRef,
  readRequestOrganizationId,
} from "@/features/entitlements/stripe/billingOwner";
import {
  billingOrganizationRequiredResponse,
  isBillingOrganizationRequiredError,
} from "@/features/entitlements/stripe/billingOwnerRoute";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ connected: false, configured: false });
    }

    // REC-62: the payout account belongs to the ORGANIZATION the creator is acting
    // in. Nothing here picks one.
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

    const existing = await getConnectAccount(owner);
    if (!existing) {
      return NextResponse.json({ connected: false, configured: true });
    }

    // Refresh from Stripe (best-effort — fall back to the mirror on error).
    const live = await refreshConnectAccount(owner).catch((err: unknown) => {
      console.error("[stripe/connect/status] could not reach Stripe", err);
      return null;
    });
    const fresh = live?.row ?? existing;

    return NextResponse.json({
      connected: true,
      configured: true,
      chargesEnabled: fresh.chargesEnabled,
      payoutsEnabled: fresh.payoutsEnabled,
      detailsSubmitted: fresh.detailsSubmitted,
      onboardedAt: fresh.onboardedAt,
      country: fresh.country,
      defaultCurrency: fresh.defaultCurrency,
      // Absent (null) when Stripe could not be reached — the caller must treat
      // that as "we don't know", never as "there is nothing outstanding".
      requirements: live?.requirements ?? null,
    });
  } catch (err) {
    console.error("[stripe/connect/status]", err);
    return NextResponse.json(
      { error: "Failed to load payout status" },
      { status: 500 },
    );
  }
}
