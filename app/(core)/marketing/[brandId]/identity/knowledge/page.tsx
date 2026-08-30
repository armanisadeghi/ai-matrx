import { Suspense } from "react";

import { BrandIdentitySiteSurface } from "@/features/marketing/components/brand/BrandIdentitySiteSurface";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { DiscoveryPage } from "@/features/marketing/seo/value-system/discovery/DiscoveryPage";

/**
 * Brand Knowledge — the Business Discovery Ladder. AI reads the client's
 * website cold and proposes its business model, customers, money map, and
 * offerings; the human rules each rung. Register item KI-040.
 *
 * Site-scoped underneath: `?site=` picks which of the brand's websites is read
 * (first one by default).
 */
export default function BrandKnowledgePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading business discovery…" />}>
      <BrandIdentitySiteSurface>
        <DiscoveryPage />
      </BrandIdentitySiteSurface>
    </Suspense>
  );
}
