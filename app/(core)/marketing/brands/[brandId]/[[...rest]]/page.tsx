import { permanentRedirect } from "next/navigation";

import {
  mapLegacyBrandRest,
  mapLegacySiteRest,
} from "@/features/marketing/lib/legacy-marketing-urls";
import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParams(query: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value))
      value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

/**
 * THE legacy door for the whole pre-restructure brand tree.
 *
 * `/marketing/brands/[brandId]/**` was the brand-first workspace until the
 * agency-model tree moved every one of its screens under `/marketing/[brandId]`
 * (brand sections) and split the site sections across `websites/` (what the
 * site IS) and `seo/` (the practice on it). ONE catch-all replaces the ~50
 * pages that lived here — a shim per page would have been fifty files that
 * drift, and the mapping is a table, not a page.
 *
 * Resolution is best-effort on purpose: it exists only to prefer the readable
 * key over a UUID in the emitted address. A reader who cannot see the row (or
 * is signed out) still gets forwarded with the segment they arrived with, and
 * the destination layout answers the access question properly instead of this
 * shim turning a real link into a 404.
 */
export default async function LegacyMarketingBrandRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; rest?: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ brandId, rest = [] }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const search = toSearchParams(query);
  const brand = await resolveBrandParam(brandId);
  const brandSeg = brand ? marketingSeg(brand) : brandId;

  const brandTarget = mapLegacyBrandRest(brandSeg, rest, search);
  if (brandTarget) permanentRedirect(brandTarget);

  // `sites/<siteId>[/section…]` — the old site tree.
  const siteParam = rest[1];
  if (!siteParam) permanentRedirect(`/marketing/${brandSeg}/websites`);
  const site = brand ? await resolveSiteParam(brand.id, siteParam) : null;
  const siteSeg = site ? marketingSeg(site) : siteParam;
  permanentRedirect(
    mapLegacySiteRest(brandSeg, siteSeg, rest.slice(2), search),
  );
}
