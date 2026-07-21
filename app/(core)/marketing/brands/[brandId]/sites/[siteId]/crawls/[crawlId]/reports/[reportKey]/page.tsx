import { notFound } from "next/navigation";
import { CrawlReportWorkspace } from "@/features/marketing/components/crawls/CrawlReportWorkspace";
import { isCrawlReportKey } from "@/features/marketing/lib/crawl-reports";

export default async function MarketingCrawlReportPage({
  params,
}: {
  params: Promise<{ crawlId: string; reportKey: string }>;
}) {
  const { crawlId, reportKey } = await params;
  if (!isCrawlReportKey(reportKey)) notFound();
  return <CrawlReportWorkspace crawlId={crawlId} reportKey={reportKey} />;
}
