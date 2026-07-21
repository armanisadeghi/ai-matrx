import { CrawlReportsIndex } from "@/features/marketing/components/crawls/CrawlReportsIndex";

export default async function MarketingCrawlReportsPage({
  params,
}: {
  params: Promise<{ crawlId: string }>;
}) {
  const { crawlId } = await params;
  return <CrawlReportsIndex crawlId={crawlId} />;
}
