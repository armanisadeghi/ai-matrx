// app/(core)/marketing/[brandId]/intelligence/competitors/page.tsx
//
// One client's tracked rivals. `CompetitorAutopsyWorkspace` is the canonical
// component the flat `/marketing/competitors` route uses, mounted here with
// THIS BRAND'S scope — it reads the rest of its state from the URL on the
// client, hence the Suspense boundary.
//
// 🚨 The brand is not optional (2026-08-30). Mounted without it, the workspace
// fell back to the first site on the PLATFORM, so every brand's competitors
// page rendered a stranger's competitors and verdict.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import CompetitorAutopsyWorkspace from "@/features/marketing/competitors/CompetitorAutopsyWorkspace";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitors",
  description:
    "Find the competitors that truly overlap, read the pages earning their visibility, and turn them into ranked opportunities.",
};

export default function BrandCompetitorsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <BrandScopedCompetitors />
    </Suspense>
  );
}
