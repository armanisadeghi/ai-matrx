import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import IntakeV3RouteClient from "./IntakeV3RouteClient";

/**
 * /commerce/intake/v3 — the vertical-rail chrome (`CameraCaptureV3`): one
 * hold-shutter (tap photo / hold video), right-hand action rail with a
 * collapse chevron, expanding serial entry, and the library drawer as the
 * ONE door to existing media. Same engine and write rules as v1/v2.
 */
export const dynamic = "force-dynamic";

export default async function CommerceIntakeV3Page({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref("/commerce/intake/v3"));
  const { asset } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <IntakeV3RouteClient initialAssetId={asset ?? null} />
      </div>
    </div>
  );
}
