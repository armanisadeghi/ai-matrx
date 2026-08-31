// app/(core)/marketing/[brandId]/intelligence/competitors/competitors/page.tsx
//
// One competitor screen, one route — the agency-model tree gives every screen
// that stands in for a different page its own URL. `view` fixes the screen
// from the route; the bare `…/competitors` URL is still Run, and a
// pre-restructure `?view=competitors` link still lands on this same screen.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Tracked competitors",
  description:
    "Every rival this brand tracks, with how it was identified and what it is doing.",
};

export default function BrandCompetitorsListPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <BrandScopedCompetitors view="competitors" />
    </Suspense>
  );
}
