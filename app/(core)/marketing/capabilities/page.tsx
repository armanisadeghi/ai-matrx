import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveLegacySiteAddress } from "@/features/marketing/lib/shim-resolve-server";

/**
 * Legacy flat pillar. The measurement catalogue is read against ONE site's SEO
 * practice now, at /marketing/[brand]/seo/[site]/capabilities. `?site=` names
 * that site, so this shim resolves its brand and lands on the real screen;
 * without one, only a person can say whose capabilities to open, so the
 * visitor gets the client roster.
 */
export default async function MarketingCapabilitiesShim({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site } = await searchParams;
  const address = site ? await resolveLegacySiteAddress(site) : null;
  if (address) {
    permanentRedirect(
      marketingRoutes.siteCapabilities(address.brandSeg, address.siteSeg),
    );
  }
  permanentRedirect(marketingRoutes.capabilitiesCatalog());
}
