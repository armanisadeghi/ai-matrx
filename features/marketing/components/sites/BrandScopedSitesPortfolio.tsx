"use client";

/**
 * The brand workspace's websites table — the canonical `SitesPortfolio`, scoped
 * to the brand in context.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key. This wrapper
 * exists only to read that context on the client; the table itself is
 * unchanged and unforked.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { useBrandSites } from "@/features/marketing/data/hooks";
import { NoWebsiteState } from "@/features/marketing/components/shared/NoWebsiteState";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { SitesPortfolio } from "./SitesPortfolio";

export function BrandScopedSitesPortfolio() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);
  // A brand with no website gets the designed social-first state, not an empty table with
  // GSC-seeding instructions that only make sense once a site exists.
  if (sites.isSuccess && (sites.data ?? []).length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <NoWebsiteState
          brandId={brand.id}
          brandName={brand.name}
          needs="site health, rankings, and the page registry"
          alternatives={[
            { label: "Open Socials", href: marketingRoutes.brandSocials(brand.id) },
            { label: "Connections", href: "/marketing/connections" },
          ]}
        />
      </div>
    );
  }
  return <SitesPortfolio brandId={brand.id} />;
}
