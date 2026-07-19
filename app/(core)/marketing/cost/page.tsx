import { Suspense } from "react";
import { WorkspaceCostWorkspace } from "@/features/marketing/components/operations/WorkspaceCostWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingCostPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading cost rollups…" />}>
      <WorkspaceCostWorkspace />
    </Suspense>
  );
}
