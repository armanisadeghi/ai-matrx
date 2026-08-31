// app/(core)/marketing/[brandId]/intelligence/competitors/opportunities/page.tsx
//
// One competitor screen, one route — the agency-model tree gives every screen
// that stands in for a different page its own URL. `view` fixes the screen
// from the route; the bare `…/competitors` URL is still Run, and a
// pre-restructure `?view=opportunities` link still lands on this same screen.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitor opportunities",
  description:
    "The ranked work a competitor autopsy turned up, and what it is worth doing about.",
};

export default function BrandCompetitorOpportunitiesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading opportunities…" />}>
      <BrandScopedCompetitors view="opportunities" />
    </Suspense>
  );
}
