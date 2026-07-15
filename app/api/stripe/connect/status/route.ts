// app/api/stripe/connect/status/route.ts
//
// GET /api/stripe/connect/status — the authed creator's live Connect status. When
// a connected account exists, this retrieves it from Stripe and refreshes the local
// mirror (so the dashboard reflects onboarding progress the instant the creator
// returns, without waiting on the account.updated webhook). Returns a small shape
// the earnings panel renders: connected / charges_enabled / details_submitted.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import {
  getConnectAccountByUser,
  refreshConnectAccount,
} from "@/features/entitlements/stripe/connect";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ connected: false, configured: false });
    }

    const existing = await getConnectAccountByUser(user.id);
    if (!existing) {
      return NextResponse.json({ connected: false, configured: true });
    }

    // Refresh from Stripe (best-effort — fall back to the mirror on error).
    const fresh = (await refreshConnectAccount(user.id).catch(() => null)) ?? existing;

    return NextResponse.json({
      connected: true,
      configured: true,
      chargesEnabled: fresh.chargesEnabled,
      payoutsEnabled: fresh.payoutsEnabled,
      detailsSubmitted: fresh.detailsSubmitted,
      onboardedAt: fresh.onboardedAt,
      country: fresh.country,
      defaultCurrency: fresh.defaultCurrency,
    });
  } catch (err) {
    console.error("[stripe/connect/status]", err);
    return NextResponse.json(
      { error: "Failed to load payout status" },
      { status: 500 },
    );
  }
}
