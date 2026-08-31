import { SiteSearchConsolePage } from "@/features/marketing/search-console/components/SiteSearchConsolePage";

/** Dig Here — run a saved rule over this site's Search Console data and read what it turns up. */
export default async function MarketingSeoSearchConsoleDigsPage({
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
      tool="digs"
      label="Loading Dig Here…"
    />
  );
}
