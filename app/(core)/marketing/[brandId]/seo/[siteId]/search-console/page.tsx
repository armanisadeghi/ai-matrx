import { SiteSearchConsolePage } from "@/features/marketing/search-console/components/SiteSearchConsolePage";

/**
 * The full Search Console dataset for THIS site — the dimension pivots
 * (Overview, Queries, Pages, Countries, Devices, Appearance) of one dataset
 * under one set of filters, which is why they stay `?tab=`.
 *
 * The four TOOLS are separate jobs and live on their own routes beside this
 * file. The mount itself is `SiteSearchConsolePage`, shared with them.
 */
export default async function MarketingSeoSearchConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SiteSearchConsolePage params={params} searchParams={searchParams} />;
}
