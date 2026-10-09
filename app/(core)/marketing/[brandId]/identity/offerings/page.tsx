import { Suspense } from "react";

import { BrandOfferingsPage } from "@/features/marketing/seo/value-system/offerings/BrandOfferingsPage";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** What this brand sells and charges — brand-level; the site view adds availability and keyword value. */
export default function BrandOfferingsRoute() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading this brand's offerings…" />}>
      <BrandOfferingsPage />
    </Suspense>
  );
}
