// app/api/stripe/connect/dashboard/route.ts
//
// POST /api/stripe/connect/dashboard — mint a single-use login link to the creator's
// Stripe Express dashboard, where Stripe HOSTS the payout/earnings/bank UI. We link
// to it, we never rebuild it. Only works once onboarding is far enough along that a
// login link is allowed (charges enabled); otherwise Stripe rejects and we 409.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getConnectAccountByUser } from "@/features/entitlements/stripe/connect";

export async function POST(_request: NextRequest) {
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

    const account = await getConnectAccountByUser(user.id);
    if (!account) {
      return NextResponse.json(
        { error: "No connected account. Finish onboarding first." },
        { status: 404 },
      );
    }

    try {
      const link = await getStripe().accounts.createLoginLink(
        account.stripeAccountId,
      );
      return NextResponse.json({ url: link.url });
    } catch (err) {
      // Stripe rejects a login link before onboarding completes.
      const message = err instanceof Error ? err.message : "Login link unavailable";
      return NextResponse.json(
        { error: "Finish onboarding before opening your payout dashboard.", detail: message },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[stripe/connect/dashboard]", err);
    return NextResponse.json(
      { error: "Failed to open payout dashboard" },
      { status: 500 },
    );
  }
}
