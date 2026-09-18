import { Suspense } from "react";

import { BrandStrategyRoom } from "@/features/marketing/strategy/components/BrandStrategyRoom";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/**
 * The brand strategy — the business facts every website of this brand reads:
 * what it does, who it serves, each service line with its own footprint.
 * Brand-scoped by ruling (Arman, 2026-09-14), so no site picker here.
 */
export default function BrandStrategyPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading the brand strategy…" />}>
      <BrandStrategyRoom />
    </Suspense>
  );
}
