import { notFound } from "next/navigation";

import { CanonicalSiteSegment } from "@/features/marketing/components/brand/CanonicalSegment";
import { MarketingSiteProvider } from "@/features/marketing/lib/brand-context";
import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";

/**
 * One site's CONTENT PLAN workspace shell.
 *
 * Both dynamic segments are dual-mode: the brand resolves globally, the site
 * resolves inside that brand (`resolveSiteParam` is React-cached, so the brand
 * layout above and this one share a single read). A UUID address renders the
 * same screen and `CanonicalSiteSegment` rewrites it to the key address, so
 * exactly one canonical URL exists per screen.
 *
 * Deliberately thin: unlike the website/SEO trees this shell mounts no site
 * chrome, because the plan workspace brings its own header
 * (`ContentPlanHeader`, an EntityModeHeader that portals into the shell). All
 * it owns is identity — descendants read the site UUID from
 * `MarketingSiteProvider`, never from the route params, which are addresses.
 */
export default async function BrandContentPlanSiteLayout({
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
      {children}
    </MarketingSiteProvider>
  );
}
