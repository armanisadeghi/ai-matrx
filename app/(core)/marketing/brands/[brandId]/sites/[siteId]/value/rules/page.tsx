import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { MeaningRulesWorkbench } from "@/features/marketing/seo/value-system/rules/MeaningRulesWorkbench";

export default function ValueRulesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading your value rules…" />}>
      <MeaningRulesWorkbench />
    </Suspense>
  );
}
