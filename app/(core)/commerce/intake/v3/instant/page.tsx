import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import IntakeV3RouteClient from "../IntakeV3RouteClient";

/**
 * /commerce/intake/v3/instant — the instant (client-run Process) lane on the
 * vertical-rail chrome. Behavior identical to /commerce/intake/instant
 * (`commerce_intake.instant_analysis` mandate, `captured → awaiting_triage`);
 * only the chrome differs.
 */
export const dynamic = "force-dynamic";

export default async function CommerceIntakeV3InstantPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref("/commerce/intake/v3/instant"));
  const { asset } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <IntakeV3RouteClient initialAssetId={asset ?? null} mode="instant" />
      </div>
    </div>
  );
}
