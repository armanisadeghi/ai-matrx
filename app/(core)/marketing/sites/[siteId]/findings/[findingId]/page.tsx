import { Suspense } from "react";
import { FindingDetail } from "@/features/marketing/components/analysis/FindingDetail";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingSiteFindingDetailPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading finding…" />}>
      <FindingDetail findingId={findingId} />
    </Suspense>
  );
}
