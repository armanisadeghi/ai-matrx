// app/(core)/marketing/[brandId]/intelligence/reputation/[siteId]/publications/page.tsx
//
// One reputation screen, one route. `view` fixes the screen from the route
// (the ids are the registry's own — `MARKETING_SITE_SUBVIEWS`, section
// "reputation"); the bare `…/[siteId]` URL stays the decision brief, and a
// pre-restructure `?view=publications` link still lands on this same screen.

import { Suspense } from "react";

import { ReputationGate } from "@/features/marketing/components/reputation/ReputationGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function BrandReputationPublicationsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading publication opportunities…" />}>
      <ReputationGate view="publications" />
    </Suspense>
  );
}
