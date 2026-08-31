import { Suspense } from "react";

import { LinksInspectionTable } from "@/features/marketing/components/inspection/LinksInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Current internal links scored against declared page link plans. */
export default function MarketingSeoLinksPlanPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading internal link compliance…" />}
    >
      <LinksInspectionTable view="plan" />
    </Suspense>
  );
}
