import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import IntakeV2RouteClient from "./IntakeV2RouteClient";

/**
 * /commerce/intake/v2 — ISOLATED rebuild of the intake capture camera on the
 * iPhone-style `features/capture-camera` chrome (the `@ai-matrx/capture`
 * extraction source). Same engine (`useIntakeSession`), same write rules,
 * same `?asset=` deep link; only the chrome differs. The live surface at
 * /commerce/intake is untouched until this version is approved.
 */
export const dynamic = "force-dynamic";

export default async function CommerceIntakeV2Page({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref("/commerce/intake/v2"));
  const { asset } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <IntakeV2RouteClient initialAssetId={asset ?? null} />
      </div>
    </div>
  );
}
