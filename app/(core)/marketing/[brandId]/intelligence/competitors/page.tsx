// app/(core)/marketing/[brandId]/intelligence/competitors/page.tsx
//
// One client's tracked rivals. `CompetitorAutopsyWorkspace` is the canonical
// component the flat `/marketing/competitors` route used, mounted here
// unchanged — it reads its own scope from the URL on the client, hence the
// Suspense boundary.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import CompetitorAutopsyWorkspace from "@/features/marketing/competitors/CompetitorAutopsyWorkspace";

export const metadata: Metadata = {
  title: "Competitors",
  description:
    "Find the competitors that truly overlap, read the pages earning their visibility, and turn them into ranked opportunities.",
};

export default function BrandCompetitorsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <CompetitorAutopsyWorkspace />
    </Suspense>
  );
}
