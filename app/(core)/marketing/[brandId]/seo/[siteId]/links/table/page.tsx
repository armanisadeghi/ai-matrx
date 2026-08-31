import { Suspense } from "react";

import { LinksInspectionTable } from "@/features/marketing/components/inspection/LinksInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Recorded link edges with search, filters, and complete pagination. */
export default function MarketingSeoLinksTablePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading link edge table…" />}>
      <LinksInspectionTable view="table" />
    </Suspense>
  );
}
