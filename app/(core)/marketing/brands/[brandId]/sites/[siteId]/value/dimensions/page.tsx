import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { DimensionManager } from "@/features/marketing/seo/value-system/dimensions/DimensionManager";

/**
 * Keyword dimension manager — where a site authors the questions its keywords
 * are sorted by, instead of an agent inventing a fresh set every run (D37).
 */
export default function KeywordDimensionsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword dimensions…" />}>
      <DimensionManager />
    </Suspense>
  );
}
