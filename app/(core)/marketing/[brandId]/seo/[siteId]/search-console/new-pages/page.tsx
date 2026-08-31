import { SiteSearchConsolePage } from "@/features/marketing/search-console/components/SiteSearchConsolePage";

/** New Pages — pages that started earning impressions in this window. */
export default async function MarketingSeoSearchConsoleNewPagesPage({
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
      tool="new-pages"
      label="Loading new pages…"
    />
  );
}
