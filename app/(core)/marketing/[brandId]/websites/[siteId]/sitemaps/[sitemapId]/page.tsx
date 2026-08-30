import { Suspense } from "react";
import { SitemapDetail } from "@/features/marketing/components/sitemaps/SitemapDetail";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingSiteSitemapPage({
  params,
}: {
  params: Promise<{ sitemapId: string }>;
}) {
  const { sitemapId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading sitemap…" />}>
      <SitemapDetail sitemapId={sitemapId} />
    </Suspense>
  );
}
