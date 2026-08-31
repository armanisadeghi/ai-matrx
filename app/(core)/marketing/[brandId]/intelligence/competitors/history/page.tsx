// app/(core)/marketing/[brandId]/intelligence/competitors/history/page.tsx
//
// One competitor screen, one route — the agency-model tree gives every screen
// that stands in for a different page its own URL. `view` fixes the screen
// from the route; the bare `…/competitors` URL is still Run, and a
// pre-restructure `?view=history` link still lands on this same screen.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitor run history",
  description:
    "Every competitor autopsy this brand has run, and how each one finished.",
};

export default function BrandCompetitorHistoryPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading run history…" />}>
      <BrandScopedCompetitors view="history" />
    </Suspense>
  );
}
