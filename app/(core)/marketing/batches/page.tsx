import { Suspense } from "react";
import { BatchesTable } from "@/features/marketing/components/operations/BatchesTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingBatchesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading batch jobs…" />}>
      <BatchesTable />
    </Suspense>
  );
}
