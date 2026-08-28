import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { ManageBody, ManageHeader } from "./ManageRouteClient";

/**
 * /tools/product-capture/manage — the desktop-first pipeline manager:
 * stage stepper (intake → analysis → research → review → finalize →
 * listing → listed), the active stage's items, and the selected item's
 * stage-specific workspace (analysis + split, research, questions,
 * grading, listing approval + export). `?item=<id>` deep-links to an item
 * on its current stage.
 */
export const dynamic = "force-dynamic";

export default async function ProductPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture/manage");
  const { item } = await searchParams;
  return (
    <>
      {/* ManageHeader injects itself (RouteHeader owns the PageHeader portal). */}
      <ManageHeader />
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 lg:px-5">
          <ManageBody initialItemId={item ?? null} />
        </div>
      </div>
    </>
  );
}
