import { Suspense } from "react";
import { SiteCostWorkspace } from "@/features/marketing/components/operations/SiteCostWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteCostPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site cost…" />}>
      <SiteCostWorkspace />
    </Suspense>
  );
}
