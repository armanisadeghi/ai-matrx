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
 * One site's REPUTATION workspace, reached from the brand's Intelligence
 * section rather than from the website tree (agency restructure, 2026-08-29).
 *
 * Reputation reads a site row, its brand, and the live crawl activity, so it
 * mounts inside the canonical site shell — the same `MarketingSiteLayoutClient`
 * the website and SEO trees use, never a second copy of it. Both dynamic
 * segments are dual-mode; `resolveSiteParam` is React-cached, and
 * `CanonicalSiteSegment` rewrites a UUID address to the key address so exactly
 * one canonical URL exists per screen.
 */
export default async function BrandReputationSiteLayout({
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
