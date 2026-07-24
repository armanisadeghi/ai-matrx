import { Suspense } from "react";
import { RanksWorkspace } from "@/features/marketing/components/ranks/RanksWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteRanksPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading rank portfolio…" />}>
      <RanksWorkspace />
    </Suspense>
  );
}
