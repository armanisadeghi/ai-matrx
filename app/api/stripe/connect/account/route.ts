// app/api/stripe/connect/account/route.ts
//
// POST /api/stripe/connect/account — make sure the authed creator HAS a Stripe
// Express connected account, and nothing else. No link, no redirect.
//
// Why this exists separately from /onboard: the payouts checklist's first step
// ("We've set up your payouts account") is an `auto` step — something we do on
// the creator's behalf rather than asking them to. /onboard also mints a
// single-use hosted onboarding link, which is exactly what an auto step must
// NOT do: that link is a one-shot credential and burning one per page visit is
// waste at best and a confusing half-started flow at worst. `ensureConnectAccount`
// is idempotent (it returns the existing account id), so this is safe to call
// as often as the checklist re-checks.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import { ensureConnectAccount } from "@/features/entitlements/stripe/connect";

export async function POST() {
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

    try {
      await ensureConnectAccount(user.id, user.email ?? null);
    } catch (err) {
      // Connect not enabled on the platform account (or creation rejected).
      // Same honest split /onboard makes — a 409 the surface can word properly.
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stripe/connect/account]", err);
    return NextResponse.json(
      { error: "Failed to set up your payouts account" },
      { status: 500 },
    );
  }
}
