import { Suspense } from "react";
import { SiteAnalysisTable } from "@/features/marketing/components/analysis/SiteAnalysisTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteAnalysisPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site analysis…" />}>
      <SiteAnalysisTable />
    </Suspense>
  );
}
