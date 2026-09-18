// The Content Plan workspace for one site — the SITE BRIEF view: what this
// website is for, reading the brand strategy. The reference every planned
// page refers back to. Seventh entry in `PLAN_VIEWS`; see ../page.tsx.

import { ContentPlanRouteBody } from "@/features/marketing/content-plan/components/ContentPlanRouteBody";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function BrandContentPlanBriefPage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  return (
    <ContentPlanRouteBody
      loginNext={marketingRoutes.brandContentPlanSite(brandId, siteId, "brief")}
    />
  );
}
