import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { AssetsBody, AssetsHeader } from "./AssetsRouteClient";

/**
 * /commerce/intake/assets — the intake hub: every org intake asset, newest
 * first (complete read). The capture screen's close lands here.
 */
export const dynamic = "force-dynamic";

export default async function IntakeAssetsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/intake/assets");
  return (
    <>
      {/* AssetsHeader injects itself (RouteHeader owns the PageHeader portal). */}
      <AssetsHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <AssetsBody />
        </div>
      </div>
    </>
  );
}
