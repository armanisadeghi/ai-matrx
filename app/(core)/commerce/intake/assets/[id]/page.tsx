import { notFound, redirect } from "next/navigation";

import { resolveIntakeAssetRouteTarget } from "@/features/commerce-intake/asset-route";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { AssetDetailBody, AssetDetailHeader } from "./AssetDetailRouteClient";

/**
 * /commerce/intake/assets/[id] — one intake asset: media, notes (guarded
 * autosave), identifiers, and the generic editable attribute rows.
 */
export const dynamic = "force-dynamic";

export default async function IntakeAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const target = resolveIntakeAssetRouteTarget(id);
  if (target.kind === "redirect") redirect(target.href);
  if (target.kind === "not-found") notFound();

  const { isAuthenticated } = await getServerAuth();
  // The asset deep link is the destination — it must survive the auth bounce.
  if (!isAuthenticated)
    redirect(
      await currentRequestLoginHref(
        `/commerce/intake/assets/${target.assetId}`,
      ),
    );
  return (
    <>
      <AssetDetailHeader assetId={target.assetId} />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <AssetDetailBody assetId={target.assetId} />
        </div>
      </div>
    </>
  );
}
