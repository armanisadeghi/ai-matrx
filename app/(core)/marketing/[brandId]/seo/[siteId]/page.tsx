import { notFound, permanentRedirect } from "next/navigation";

import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * The SEO branch root is a DOOR, not a screen: keywords is where the practice
 * starts ("Start here" is the map of every screen that gives keywords
 * meaning), so the bare `…/seo/[siteId]` address lands there permanently.
 *
 * The redirect is built from the RESOLVED rows so a UUID address arrives at
 * the key address in one hop instead of bouncing through
 * `CanonicalSiteSegment` afterwards.
 */
export default async function MarketingSeoSiteRootPage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  const site = await resolveSiteParam(brand.id, siteId);
  if (!site) notFound();
  permanentRedirect(
    marketingRoutes.siteKeywords(marketingSeg(brand), marketingSeg(site)),
  );
}
