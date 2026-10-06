// Research ANY domain (seo_domain over the screen-run door) — an agency-plane
// TOOL beside YouTube research. `?d=<host>&site=<siteId>&tab=…`; the optional
// site sets brand-term subtraction and the "They rank, we don't" comparison.

import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { DomainResearchPage } from "@/features/marketing/seo/domain-research/DomainResearchPage";

export default function MarketingDomainResearchPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading domain research…" />}>
      <DomainResearchPage />
    </Suspense>
  );
}
