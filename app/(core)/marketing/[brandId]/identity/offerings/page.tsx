import { Suspense } from "react";

import { BrandIdentitySiteSurface } from "@/features/marketing/components/brand/BrandIdentitySiteSurface";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { TopicTreeWorkbench } from "@/features/marketing/seo/value-system/topics/TopicTreeWorkbench";

/** The Offering tree: the user-facing name for the shared `seo.topic` hierarchy. */
export default function BrandOfferingsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading the offering tree…" />}>
      <BrandIdentitySiteSurface>
        <TopicTreeWorkbench />
      </BrandIdentitySiteSurface>
    </Suspense>
  );
}
