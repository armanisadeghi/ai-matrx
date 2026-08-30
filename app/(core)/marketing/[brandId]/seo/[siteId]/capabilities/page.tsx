import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoCapabilitiesWorkspace } from "@/features/marketing/seo/capabilities/SeoCapabilitiesWorkspace";
import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * What's measured and switched on for THIS site, and each capability's
 * evidence. The old `…/sites/[siteId]/capabilities` route was a redirect out
 * to the flat catalogue; the catalogue now lives here, bound to the site.
 *
 * `SeoCapabilitiesWorkspace` selects its site from `?site=<uuid>` (and offers a
 * switcher over the whole portfolio), so this route stamps the site on the URL
 * rather than forking a second, site-bound copy of the catalogue.
 */
export default async function MarketingSeoCapabilitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandId, siteId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  const site = await resolveSiteParam(brand.id, siteId);
  if (!site) notFound();

  if (query.site !== site.id) {
    redirect(
      `${marketingRoutes.siteCapabilities(
        marketingSeg(brand),
        marketingSeg(site),
      )}?site=${site.id}`,
    );
  }

  return (
    <Suspense fallback={<LoadingSurface label="Loading SEO capabilities…" />}>
      <SeoCapabilitiesWorkspace />
    </Suspense>
  );
}
