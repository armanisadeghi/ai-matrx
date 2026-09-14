import { Suspense } from "react";

import { BrandIdentitySiteSurface } from "@/features/marketing/components/brand/BrandIdentitySiteSurface";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { OfferingsWorkbench } from "@/features/marketing/seo/value-system/offerings/OfferingsWorkbench";

/** What this brand sells, and what the selected site offers of it (brand-offerings cutover). */
export default function BrandOfferingsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading this brand's offerings…" />}>
      <BrandIdentitySiteSurface>
        <OfferingsWorkbench />
      </BrandIdentitySiteSurface>
    </Suspense>
  );
}
