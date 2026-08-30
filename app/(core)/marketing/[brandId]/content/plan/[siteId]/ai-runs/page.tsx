// The Content Plan workspace for one site — the AI RUNS view.
//
// Not in the restructure spec's list of five, but it is the sixth entry in
// `PLAN_VIEWS` and the workspace header links to it: without this leaf the
// header would carry a 404 (no dead ends). See ../page.tsx.

import { ContentPlanRouteBody } from "@/features/marketing/content-plan/components/ContentPlanRouteBody";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function BrandContentPlanAiRunsPage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  return (
    <ContentPlanRouteBody
      loginNext={marketingRoutes.brandContentPlanSite(
        brandId,
        siteId,
        "ai-runs",
      )}
    />
  );
}
