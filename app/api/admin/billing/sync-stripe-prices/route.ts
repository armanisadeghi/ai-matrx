// POST /api/admin/billing/sync-stripe-prices — super-admin. Makes Stripe's
// products, recurring prices and billing-portal plan lists match billing.plan
// (features/entitlements/stripe/planCatalog.ts). The plan editor calls it after
// a price is saved; it never creates a charge. Next-only concern: Stripe SDK.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { getStripe, isStripeConfigured, requiredStripeMode } from "@/lib/stripe/server";
import { syncAllPlanPrices } from "@/features/entitlements/stripe/planCatalog";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkIsSuperAdmin(supabase, user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe is not configured here" }, { status: 503 });

  const mode = requiredStripeMode();
  try {
    const { rows, retired, errors } = await syncAllPlanPrices(getStripe(mode), createAdminClient(), mode);
    const body = {
      mode,
      created: rows.filter((r) => r.created).length,
      archived: rows.reduce((n, r) => n + r.archived, 0) + retired.reduce((n, r) => n + r.archived, 0),
      rows,
      retired,
      errors,
    };
    if (errors.length)
      return NextResponse.json(
        { ...body, error: errors.map((e) => `${e.plan}: ${e.error}`).join("; ") },
        { status: 500 },
      );
    return NextResponse.json(body);
  } catch (err) {
    console.error("[admin/billing/sync-stripe-prices]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), mode },
      { status: 500 },
    );
  }
}
