import { redirect } from "next/navigation";

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
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/intake/assets");
  const { id } = await params;
  return (
    <>
      <AssetDetailHeader assetId={id} />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <AssetDetailBody assetId={id} />
        </div>
      </div>
    </>
  );
}
