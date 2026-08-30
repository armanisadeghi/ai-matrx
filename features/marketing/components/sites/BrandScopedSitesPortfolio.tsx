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

import { SitesPortfolio } from "./SitesPortfolio";

export function BrandScopedSitesPortfolio() {
  const brand = useMarketingBrand();
  return <SitesPortfolio brandId={brand.id} />;
}
