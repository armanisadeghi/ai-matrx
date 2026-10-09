// app/(core)/marketing/[brandId]/intelligence/competitors/run/page.tsx
//
// The SEO autopsy "Run" screen. The bare `…/competitors` route is the brand's
// competitor list (All); Run is one of the autopsy modes beside it.

import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedCompetitors } from "@/features/marketing/competitors/BrandScopedCompetitors";

export default function BrandCompetitorRunPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <BrandScopedCompetitors view="run" />
    </Suspense>
  );
}
