import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteKeywordPerformanceWorkspace } from "@/features/seo/keyword-research/components/SiteKeywordPerformanceWorkspace";

export default function MarketingSiteKeywordsPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading keyword performance…" />}
    >
      <SiteKeywordPerformanceWorkspace />
    </Suspense>
  );
}
