import { Suspense } from "react";
import { CoverageWorkspace } from "@/features/marketing/components/coverage/CoverageWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteCoveragePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading coverage…" />}>
      <CoverageWorkspace />
    </Suspense>
  );
}
