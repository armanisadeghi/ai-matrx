import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteRunConsoleMount } from "@/features/marketing/seo/run-console/SiteRunConsoleMount";

/**
 * One run-console result screen at the SITE tier, on its own route. `view`
 * fixes the screen; the bare `…/automations` URL stays "This run".
 * See `features/marketing/seo/run-console/FEATURE.md`.
 */
export default function MarketingSeoAutomationUnplacedPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading unplaced keywords…" />}>
      <SiteRunConsoleMount view="unplaced" />
    </Suspense>
  );
}
