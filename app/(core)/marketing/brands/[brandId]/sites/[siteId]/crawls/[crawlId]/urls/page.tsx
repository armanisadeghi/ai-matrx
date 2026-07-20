import { Suspense } from "react";
import { CrawlUrlsTable } from "@/features/marketing/components/crawls/CrawlUrlsTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingCrawlUrlsPage({
  params,
}: {
  params: Promise<{ crawlId: string }>;
}) {
  const { crawlId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading crawl URLs…" />}>
      <CrawlUrlsTable crawlId={crawlId} />
    </Suspense>
  );
}
