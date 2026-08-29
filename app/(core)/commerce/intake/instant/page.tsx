import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import IntakeRouteClient from "../IntakeRouteClient";

/**
 * /commerce/intake/instant — the CLIENT-side process-mode lane of the intake
 * capture app (ported from the /tools/product-capture trial).
 *
 * The same full-screen capture surface as /commerce/intake, plus a Process
 * button: the browser runs the intake-analysis agent through the
 * `commerce_intake.instant_analysis` mandate and streams the
 * `electronics_intake_analysis` record straight back into a bottom sheet.
 * A processed asset goes `captured → awaiting_triage` directly (its close
 * never re-fires `captured`), so the server-side W5 pipeline sweep can't
 * double-process it. Feature: `features/commerce-intake/`.
 */
export const dynamic = "force-dynamic";

export default async function CommerceIntakeInstantPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref("/commerce/intake/instant"));
  const { asset } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <IntakeRouteClient initialAssetId={asset ?? null} mode="instant" />
      </div>
    </div>
  );
}
