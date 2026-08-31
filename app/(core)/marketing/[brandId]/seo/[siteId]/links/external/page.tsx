import { Suspense } from "react";

import { LinksInspectionTable } from "@/features/marketing/components/inspection/LinksInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Outbound links grouped by destination domain. */
export default function MarketingSeoLinksExternalPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading external links…" />}>
      <LinksInspectionTable view="external" />
    </Suspense>
  );
}
