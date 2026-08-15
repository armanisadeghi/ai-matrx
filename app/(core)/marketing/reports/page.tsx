import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { MarketingReportsWorkspace } from "@/features/marketing/reports/MarketingReportsWorkspace";

export default function Page() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading marketing reports…" />}>
      <MarketingReportsWorkspace />
    </Suspense>
  );
}
