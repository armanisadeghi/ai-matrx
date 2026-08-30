import { notFound } from "next/navigation";

import { CanonicalSiteSegment } from "@/features/marketing/components/brand/CanonicalSegment";
import { MarketingSiteLayoutClient } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { MarketingSiteProvider } from "@/features/marketing/lib/brand-context";
import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";

/**
 * The WEBSITE INVENTORY shell for one site — what the site IS (pages,
 * structure, sitemaps, media, crawls, settings).
 *
 * Both dynamic segments are dual-mode: the brand resolves globally, the site
 * resolves inside that brand (`resolveSiteParam` is React-cached, so the brand
 * layout above and this one share a single read). A UUID address renders the
 * same screen and `CanonicalSiteSegment` replaces it with the key address, so
 * exactly one canonical URL exists per screen.
 *
 * Descendants read UUIDs from `MarketingSiteProvider`, never from the route
 * params — the params are ADDRESSES and are usually keys.
 */
export default async function MarketingWebsiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  const site = await resolveSiteParam(brand.id, siteId);
  if (!site) notFound();
  const seg = marketingSeg(site);
  return (
    <MarketingSiteProvider
      value={{
        id: site.id,
        slug: site.slug,
        name: site.name,
        domain: site.domain,
        seg,
      }}
    >
      <CanonicalSiteSegment expected={seg} param={siteId} />
      <MarketingSiteLayoutClient>{children}</MarketingSiteLayoutClient>
    </MarketingSiteProvider>
  );
}
