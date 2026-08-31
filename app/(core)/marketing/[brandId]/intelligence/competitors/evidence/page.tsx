// app/(core)/marketing/[brandId]/intelligence/competitors/evidence/page.tsx
//
// One competitor screen, one route — the agency-model tree gives every screen
// that stands in for a different page its own URL. `view` fixes the screen
// from the route; the bare `…/competitors` URL is still Run, and a
// pre-restructure `?view=evidence` link still lands on this same screen.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitor evidence",
  description:
    "What the last autopsy actually looked at — the pages, keywords, and limits behind the verdict.",
};

export default function BrandCompetitorEvidencePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading evidence…" />}>
      <BrandScopedCompetitors view="evidence" />
    </Suspense>
  );
}
