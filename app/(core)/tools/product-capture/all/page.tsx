import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { AllItemsBody, AllItemsHeader } from "./AllItemsRouteClient";

/**
 * /tools/product-capture/all — the manage page: every capture item of the
 * org, newest first, on the canonical data table. Rows open VIEW mode
 * (`../item/[id]`); per-row actions also open CAPTURE mode
 * (`/tools/product-capture?item=<id>`) or delete.
 */
export const dynamic = "force-dynamic";

export default async function ProductCaptureAllPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture/all");
  return (
    <>
      {/* AllItemsHeader injects itself into the shell header (RouteHeader
          owns the PageHeader portal — wrapping it again splits the center
          zone in half). */}
      <AllItemsHeader />
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-safe pt-3">
          <AllItemsBody />
        </div>
      </div>
    </>
  );
}
