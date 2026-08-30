"use client";

/**
 * The brand workspace's Monitoring door — the canonical `MonitoringFrontDoor`,
 * scoped to the brand in context and writing its `?site=` back onto the brand
 * route rather than the flat one.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { MonitoringFrontDoor } from "./MonitoringFrontDoor";

export function BrandScopedMonitoring() {
  const brand = useMarketingBrand();
  return (
    <MonitoringFrontDoor
      brandId={brand.id}
      basePath={marketingRoutes.brandMonitoring(brand.seg)}
    />
  );
}
