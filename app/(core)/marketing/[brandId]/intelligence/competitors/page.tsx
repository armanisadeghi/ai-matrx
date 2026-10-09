// app/(core)/marketing/[brandId]/intelligence/competitors/page.tsx
//
// One client's tracked rivals; the default view is the brand-level competitor
// list with social accounts ("All"), the SEO autopsy screens are its other
// modes. `CompetitorAutopsyWorkspace` is the canonical
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
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export const metadata: Metadata = {
  title: "Competitors",
  description:
    "Find the competitors that truly overlap, read the pages earning their rankings, and turn them into ranked opportunities.",
};

export default function BrandCompetitorsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <BrandScopedCompetitors view="all" />
    </Suspense>
  );
}
