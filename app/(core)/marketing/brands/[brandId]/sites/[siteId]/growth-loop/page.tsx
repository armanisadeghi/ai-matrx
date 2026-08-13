import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteGrowthLoopWorkspace } from "@/features/growth-loop/run/components/SiteGrowthLoopWorkspace";

export default function MarketingSiteGrowthLoopPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading the growth loop…" />}>
      <SiteGrowthLoopWorkspace />
    </Suspense>
  );
}
