import { Suspense } from "react";
import { CrossSiteRanksHub } from "@/features/marketing/components/ranks/CrossSiteRanksHub";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingRanksPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading rank portfolio…" />}>
      <CrossSiteRanksHub />
    </Suspense>
  );
}
