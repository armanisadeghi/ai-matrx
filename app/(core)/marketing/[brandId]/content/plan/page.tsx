// app/(core)/marketing/[brandId]/content/plan/page.tsx
//
// The Content Plan LIST — the section's front door (canonical entry-list
// doctrine: a list of every site you can plan, never a forced workspace).
// Clicking a site opens its plan workspace at
// /marketing/<brand>/content/plan/<site>.
//
// Brand-scoped 2026-08-30: `BrandScopedPlanSitesList` mounts the canonical
// `PlanSitesList` (not a copy) with the brand from `useMarketingBrand()`, so
// the list is this client's websites instead of every site the viewer can
// plan. The component's own site DROPDOWN stays deliberately cross-org — a
// plan applied under another org must stay reachable — and rows keep linking
// through their own doors.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { ContentPlanListHeader } from "@/features/marketing/content-plan/components/ContentPlanListHeader";
import { BrandScopedPlanSitesList } from "@/features/marketing/content-plan/components/BrandScopedPlanSitesList";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function BrandContentPlanPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(
      `/login?next=${encodeURIComponent(marketingRoutes.brandContentPlan(brandId))}`,
    );
  }

  return (
    <>
      <PageHeader>
        <ContentPlanListHeader />
      </PageHeader>
      <div className="matrx-touch-targets h-full overflow-hidden pt-[var(--shell-header-h)]">
        <BrandScopedPlanSitesList />
      </div>
    </>
  );
}
