// The Content Plan workspace for one site — the TABLE view.
// See ../page.tsx: the view is a route, the body is the ONE canonical
// workspace.

import { ContentPlanRouteBody } from "@/features/marketing/content-plan/components/ContentPlanRouteBody";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function BrandContentPlanTablePage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  return (
    <ContentPlanRouteBody
      loginNext={marketingRoutes.brandContentPlanSite(brandId, siteId, "table")}
    />
  );
}
