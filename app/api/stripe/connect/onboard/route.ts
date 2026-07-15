// app/api/stripe/connect/onboard/route.ts
//
// POST /api/stripe/connect/onboard — start (or resume) Stripe Connect Express
// onboarding for the authed creator. Ensures a connected Express account exists
// (billing.connect_account), then mints a single-use account-onboarding link and
// returns its URL for the client to redirect to. Stripe hosts the whole KYC/bank
// flow; on completion the creator is bounced back to the dashboard.
//
// Requires Connect to be ENABLED on the platform Stripe account (Arman). Until
// then stripe.accounts.create fails with a clear "sign up for Connect" error,
// which this surfaces as a 409 so the dashboard can tell the creator honestly.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import { getStripe } from "@/lib/stripe/server";
import { ensureConnectAccount } from "@/features/entitlements/stripe/connect";

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Payouts are not configured yet." },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const origin = request.nextUrl.origin;
    const returnTo = `${origin}/education/creator?connect=return`;
    const refreshTo = `${origin}/education/creator?connect=refresh`;

    let accountId: string;
    try {
      accountId = await ensureConnectAccount(user.id, user.email ?? null);
    } catch (err) {
      // Connect not enabled on the platform (or account-creation rejected).
      const message = err instanceof Error ? err.message : "Could not create account";
      const connectDisabled = message.toLowerCase().includes("connect");
      return NextResponse.json(
        {
          error: connectDisabled
            ? "Creator payouts aren't switched on yet. Please check back soon."
            : message,
          connectDisabled,
        },
        { status: connectDisabled ? 409 : 500 },
      );
    }

    const link = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: refreshTo,
      return_url: returnTo,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    console.error("[stripe/connect/onboard]", err);
    return NextResponse.json(
      { error: "Failed to start onboarding" },
      { status: 500 },
    );
  }
}
