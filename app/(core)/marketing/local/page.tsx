import { permanentRedirect } from "next/navigation";

import { marketingSeg } from "@/features/marketing/lib/keys";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Legacy flat pillar. Locations belong to a client, so Local & Listings is a
 * brand section now: /marketing/[brand]/locations (and /locations/[locationId]
 * for one canonical location). The old cross-brand door already accepted
 * `?brand=` / `?location=`; those keep resolving, straight onto the new
 * address with slug segments. A plain visit names no client, so it lands on
 * the roster.
 */
export default async function MarketingLocalShim({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; location?: string }>;
}) {
  const { brand, location } = await searchParams;
  const resolved = brand ? await resolveBrandParam(brand) : null;
  if (resolved) {
    const seg = marketingSeg(resolved);
    permanentRedirect(
      location
        ? marketingRoutes.brandLocation(seg, location)
        : marketingRoutes.brandLocal(seg),
    );
  }
  permanentRedirect(marketingRoutes.brands());
}
