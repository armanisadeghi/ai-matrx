import { Suspense } from "react";
import { PagesTable } from "@/features/marketing/components/pages/PagesTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingPagesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading canonical pages…" />}>
      <PagesTable />
    </Suspense>
  );
}
