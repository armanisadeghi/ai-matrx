import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { MeaningRulesWorkbench } from "@/features/marketing/seo/value-system/rules/MeaningRulesWorkbench";

/** The Rulebook: what earns points and how much — matchers, worth and levels. */
export default function MarketingSeoKeywordValueRulesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading your value rules…" />}>
      <MeaningRulesWorkbench />
    </Suspense>
  );
}
