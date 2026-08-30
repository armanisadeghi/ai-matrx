import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveLegacySiteAddress } from "@/features/marketing/lib/shim-resolve-server";

/**
 * Legacy flat pillar. Search Console is one site's SEO screen now, at
 * /marketing/[brand]/seo/[site]/search-console. `?site=` names that site;
 * without one the visitor gets the client roster rather than a guessed brand.
 * (Connecting the Google account itself is an agency operation and lives at
 * /marketing/operations/connections/google.)
 */
export default async function MarketingSearchConsoleShim({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site } = await searchParams;
  const address = site ? await resolveLegacySiteAddress(site) : null;
  if (address) {
    permanentRedirect(
      marketingRoutes.siteSearchConsole(address.brandSeg, address.siteSeg),
    );
  }
  permanentRedirect(marketingRoutes.brands());
}
