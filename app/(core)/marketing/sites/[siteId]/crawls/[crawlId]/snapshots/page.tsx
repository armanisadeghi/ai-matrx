import { Suspense } from "react";
import { CrawlSnapshotsInspectionTable } from "@/features/marketing/components/inspection/CrawlSnapshotsInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingCrawlSnapshotsPage({
  params,
}: {
  params: Promise<{ crawlId: string }>;
}) {
  const { crawlId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading crawl snapshots…" />}>
      <CrawlSnapshotsInspectionTable crawlId={crawlId} />
    </Suspense>
  );
}
