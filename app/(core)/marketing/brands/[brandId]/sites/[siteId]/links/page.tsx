import { Suspense } from "react";
import { LinksInspectionTable } from "@/features/marketing/components/inspection/LinksInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteLinksPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site link graph…" />}>
      <LinksInspectionTable />
    </Suspense>
  );
}
