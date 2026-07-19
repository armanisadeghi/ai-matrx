import { Suspense } from "react";
import { BatchDetailWorkspace } from "@/features/marketing/components/operations/BatchDetailWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingBatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading batch…" />}>
      <BatchDetailWorkspace batchId={batchId} />
    </Suspense>
  );
}
