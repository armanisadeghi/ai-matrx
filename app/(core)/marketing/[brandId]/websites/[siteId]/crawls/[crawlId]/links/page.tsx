import { Suspense } from "react";
import { LinksInspectionTable } from "@/features/marketing/components/inspection/LinksInspectionTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingCrawlLinksPage({
  params,
}: {
  params: Promise<{ crawlId: string }>;
}) {
  const { crawlId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading crawl links…" />}>
      <LinksInspectionTable crawlId={crawlId} />
    </Suspense>
  );
}
