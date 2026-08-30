// The Content Plan workspace for one site — the TREE view (the index).
// A view is a ROUTE now (agency restructure, 2026-08-29); the body is the ONE
// canonical workspace and `usePlanWorkspaceParams` reads the active view from
// this path.

import { ContentPlanRouteBody } from "@/features/marketing/content-plan/components/ContentPlanRouteBody";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function BrandContentPlanTreePage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  return (
    <ContentPlanRouteBody
      loginNext={marketingRoutes.brandContentPlanSite(brandId, siteId, "tree")}
    />
  );
}
