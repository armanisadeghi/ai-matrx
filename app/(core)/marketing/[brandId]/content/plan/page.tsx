// app/(core)/marketing/[brandId]/content/plan/page.tsx
//
// The Content Plan LIST — the section's front door (canonical entry-list
// doctrine: a list of every site you can plan, never a forced workspace).
// Clicking a site opens its plan workspace at
// /marketing/<brand>/content/plan/<site>.
//
// NOTE (agency restructure, 2026-08-29): `PlanSitesList` is the ORG-WIDE list
// the flat `/marketing/content-plan` route used, and it is mounted here
// unchanged — the canonical component, not a copy. It therefore still shows
// every site the viewer can plan rather than only this brand's. Narrowing it
// to the brand in the URL is a component change, out of scope for the route
// move; tracked in the restructure handoff.

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
