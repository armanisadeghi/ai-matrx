// app/(core)/marketing/[brandId]/intelligence/reputation/[siteId]/cases/page.tsx
//
// One reputation screen, one route. `view` fixes the screen from the route
// (the ids are the registry's own — `MARKETING_SITE_SUBVIEWS`, section
// "reputation"); the bare `…/[siteId]` URL stays the decision brief, and a
// pre-restructure `?view=cases` link still lands on this same screen.

import { Suspense } from "react";

import { ReputationGate } from "@/features/marketing/components/reputation/ReputationGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function BrandReputationCasesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading reputation cases…" />}>
      <ReputationGate view="cases" />
    </Suspense>
  );
}
