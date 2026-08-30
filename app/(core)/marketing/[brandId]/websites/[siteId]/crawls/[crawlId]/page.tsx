import { CrawlSummary } from "@/features/marketing/components/crawls/CrawlSummary";

export default async function MarketingCrawlDetailPage({
  params,
}: {
  params: Promise<{ crawlId: string }>;
}) {
  const { crawlId } = await params;
  return <CrawlSummary crawlId={crawlId} />;
}
