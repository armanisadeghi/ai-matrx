import { SiteSearchConsolePage } from "@/features/marketing/search-console/components/SiteSearchConsolePage";

/** Insights — the algorithms that read this site's Search Console data for you. */
export default async function MarketingSeoSearchConsoleInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <SiteSearchConsolePage
      params={params}
      searchParams={searchParams}
      tool="insights"
      label="Loading insights…"
    />
  );
}
