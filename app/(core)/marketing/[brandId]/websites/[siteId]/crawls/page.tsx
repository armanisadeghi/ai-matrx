import { Suspense } from "react";
import { CrawlsTable } from "@/features/marketing/components/crawls/CrawlsTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingCrawlsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading crawl sessions…" />}>
      <CrawlsTable />
    </Suspense>
  );
}
