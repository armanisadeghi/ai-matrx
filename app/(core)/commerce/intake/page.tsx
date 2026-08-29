import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import IntakeRouteClient from "./IntakeRouteClient";

/**
 * /commerce/intake — the W4 capture app: lands DIRECTLY in the full-screen
 * camera (no dashboard, no "start session" button). QR (serialized) mode
 * keys assets by `our_qr` identifier rows; untracked mode streams
 * batch-level artifacts in `sequence_index` order with delineator frames.
 * `?asset=<id>` opens capture on an existing asset (mid-item resume also
 * rides localStorage). Feature: `features/commerce-intake/`.
 */
export const dynamic = "force-dynamic";

export default async function CommerceIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  // The destination (incl. ?asset= deep links) must survive the auth bounce.
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref("/commerce/intake"));
  const { asset } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <IntakeRouteClient initialAssetId={asset ?? null} />
      </div>
    </div>
  );
}
