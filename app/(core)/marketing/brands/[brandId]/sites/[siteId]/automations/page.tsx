import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteRunConsoleMount } from "@/features/marketing/seo/run-console/SiteRunConsoleMount";

/**
 * The run console at the SITE tier — this brand alone. KI-049.
 * See `features/marketing/seo/run-console/FEATURE.md`.
 */
export default function MarketingSiteAutomationsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading automations…" />}>
      <SiteRunConsoleMount />
    </Suspense>
  );
}
