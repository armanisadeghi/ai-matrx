import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteKeywordsView } from "@/features/marketing/seo/keyword-research/components/SiteKeywordsView";

export default function MarketingSiteKeywordsPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading keyword performance…" />}
    >
      <SiteKeywordsView />
    </Suspense>
  );
}
