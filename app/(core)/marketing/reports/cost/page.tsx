// The cross-client cost roll-up — an AGENCY-plane report (it concerns no
// single brand), moved here from the flat `/marketing/cost` in the 2026-08-28
// agency restructure. `/marketing/cost` is now a 308 shim onto this route.

import { Suspense } from "react";
import { WorkspaceCostWorkspace } from "@/features/marketing/components/operations/WorkspaceCostWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingCostReportPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading cost rollups…" />}>
      <WorkspaceCostWorkspace />
    </Suspense>
  );
}
