import { Suspense } from "react";
import { FindingsTable } from "@/features/marketing/components/analysis/FindingsTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteFindingsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading findings…" />}>
      <FindingsTable />
    </Suspense>
  );
}
