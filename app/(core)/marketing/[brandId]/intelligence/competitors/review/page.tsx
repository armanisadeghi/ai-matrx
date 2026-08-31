// app/(core)/marketing/[brandId]/intelligence/competitors/review/page.tsx
//
// One competitor screen, one route — the agency-model tree gives every screen
// that stands in for a different page its own URL. `view` fixes the screen
// from the route; the bare `…/competitors` URL is still Run, and a
// pre-restructure `?view=review` link still lands on this same screen.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitor review",
  description:
    "Rule on the rivals the search found — which of them actually compete with this brand.",
};

export default function BrandCompetitorReviewPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitor review…" />}>
      <BrandScopedCompetitors view="review" />
    </Suspense>
  );
}
